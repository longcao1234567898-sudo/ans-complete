/**
 * ĐƯỜNG OTP ĐÓNG KHI TÍNH NĂNG TẮT (BUG-050)
 *
 * Xác thực email tắt mặc định (BAT_XAC_THUC_EMAIL, routes/submissions.js chỉ đòi vé khi cờ
 * bằng 'true'). Nhưng POST /api/otp/send vẫn mở, không qua cổng "không phải người máy", và chỉ
 * giới hạn theo từng email: khai BREVO_API_KEY như mẫu cong-khai.env là bất kỳ ai cũng dùng
 * máy chủ gửi thư "mã xác thực" của đơn vị tới email tuỳ ý — đốt hạn mức Brevo, làm tên miền
 * bị đánh dấu thư rác, quấy rối người nhận; mỗi lần gửi còn băm bcrypt trên luồng chính.
 *
 * Mã ẩn danh (/anon-code, /anon-verify) thì máy chủ KHÔNG đòi ở bất kỳ cấu hình nào nữa,
 * nhưng hai đường vẫn mở: mỗi lần gọi băm bcrypt trên luồng chính và ghi một dòng (kèm IP) vào
 * otp_codes.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi } from './khung-sqlite.js';

datBienMoiTruongHopLe();
for (const k of ['BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_USER', 'MAIL_PASS']) delete process.env[k];
const { pool } = await import('../src/db.js');
const { default: otpRouter } = await import('../src/routes/otp.js');

const BANG_OTP = `CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email_hash TEXT, code_hash TEXT, attempts INTEGER DEFAULT 0,
  is_used INTEGER DEFAULT 0, expires_at TEXT, ip_address TEXT, created_at TEXT DEFAULT (NOW()))`;

let ctl;
let coCu;
let envCu;
beforeEach(() => {
  if (!BO_QUA) ctl = dungCsdl(pool, { themCau: [BANG_OTP] });
  coCu = process.env.BAT_XAC_THUC_EMAIL;
  envCu = process.env.NODE_ENV;
});
afterEach(() => {
  if (coCu === undefined) delete process.env.BAT_XAC_THUC_EMAIL; else process.env.BAT_XAC_THUC_EMAIL = coCu;
  process.env.NODE_ENV = envCu;
});

const goiOtp = (duong, body = {}) => goi({ duongGoc: '/api/otp', router: otpRouter, method: 'POST', duong, body });
const soDong = () => ctl.db.prepare('SELECT COUNT(*) AS n FROM otp_codes').get().n;

test('cờ tắt (không khai): /send và /verify trả 404, không ghi gì', { skip: BO_QUA }, async () => {
  delete process.env.BAT_XAC_THUC_EMAIL;
  /* development cho phép chế độ demo — nếu không chặn ở cửa, /send sẽ tạo mã */
  process.env.NODE_ENV = 'development';
  for (const [d, b] of [['/send', { email: 'nan.nhan@vi-du.vn' }], ['/verify', { email: 'a@vi-du.vn', code: '123456' }]]) {
    const r = await goiOtp(d, b);
    assert.equal(r.status, 404, `${d} phải đóng khi xác thực email tắt, đang ${r.status}`);
  }
  assert.equal(soDong(), 0, 'đường đã tắt vẫn ghi mã vào otp_codes');
});

test('cờ khai sai chữ ("TRUE", "1"): vẫn coi là tắt — chỉ đúng "true" mới mở, như submissions.js', { skip: BO_QUA }, async () => {
  process.env.NODE_ENV = 'development';
  for (const co of ['TRUE', '1', 'yes']) {
    process.env.BAT_XAC_THUC_EMAIL = co;
    const r = await goiOtp('/send', { email: 'nan.nhan@vi-du.vn' });
    assert.equal(r.status, 404, `BAT_XAC_THUC_EMAIL=${co}: đang ${r.status}`);
  }
  assert.equal(soDong(), 0);
});

test('mã ẩn danh: /anon-code, /anon-verify đóng ở MỌI cấu hình, kể cả viết hoa, không ghi dòng nào', { skip: BO_QUA }, async () => {
  for (const co of [undefined, 'true']) {
    if (co === undefined) delete process.env.BAT_XAC_THUC_EMAIL; else process.env.BAT_XAC_THUC_EMAIL = co;
    for (const d of ['/anon-code', '/ANON-CODE', '/anon-code/', '/anon-verify']) {
      const r = await goiOtp(d, { code: '123456', anonId: 'a'.repeat(48) });
      assert.equal(r.status, 404, `${d} (cờ ${co}) phải đóng, đang ${r.status}`);
    }
  }
  assert.equal(soDong(), 0, 'đường ẩn danh đã bỏ vẫn ghi mã vào otp_codes');
});

test('cờ bật ("true"): /send vẫn chạy vào xử lý như cũ (đối chứng — lớp chặn không đóng nhầm)', { skip: BO_QUA }, async () => {
  process.env.BAT_XAC_THUC_EMAIL = 'true';
  process.env.NODE_ENV = 'production';
  const r = await goiOtp('/send', { email: 'nguoi.gui@vi-du.vn' });
  /* Chưa khai dịch vụ email ở máy thật -> 503 của BUG-025, tức là đã vào tới xử lý */
  assert.equal(r.status, 503, r.text.slice(0, 200));
});

test('BUG-055: cờ bật, /send tạo mã KHÔNG ghi IP — đường email đếm theo email, không đọc IP', { skip: BO_QUA }, async () => {
  process.env.BAT_XAC_THUC_EMAIL = 'true';
  process.env.NODE_ENV = 'development';   // chế độ demo của máy cá nhân: tạo mã, không gửi thư
  const r = await goiOtp('/send', { email: 'nguoi.gui@vi-du.vn' });
  assert.equal(r.status, 200, r.text.slice(0, 200));
  const ds = ctl.db.prepare('SELECT ip_address FROM otp_codes').all();
  assert.equal(ds.length, 1);
  assert.equal(ds[0].ip_address, null, 'otp_codes còn ghi IP thô cạnh băm email');
});
