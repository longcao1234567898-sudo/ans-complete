/**
 * BUG-025 — CHƯA CẤU HÌNH EMAIL THÌ KHÔNG TRẢ MÃ, KHÔNG GHI EMAIL RA LOG
 * ============================================================================
 *
 * Chưa khai dịch vụ email, lib/mailer.js rơi về "chế độ DEMO": trả mã xác thực
 * thẳng về trình duyệt (`devCode`) và ghi email cùng mã ra log máy chủ. Chế độ
 * này dành cho máy cá nhân, nhưng trước đây nó bật ở MỌI nơi chưa khai email —
 * kể cả máy chạy thật. Thí điểm P48 thấy máy chủ `NODE_ENV=production` vẫn báo
 * "Email OTP: CHẾ ĐỘ DEMO". Hậu quả:
 *   · ai cũng "xác thực" được email của người khác (mã nằm ngay trong phản hồi);
 *   · email người gửi — thông tin nhận diện — nằm chữ thường trong log máy chủ,
 *     ai đọc được log (người quản trị máy, nhà cung cấp hosting) là biết.
 *
 * Luật 1 (fail-safe): thiếu cấu hình thì từ chối bước này, không chạy chế độ
 * yếu. Không dựa vào NODE_ENV=production để nhận ra máy thật — Render không đặt
 * biến đó (xem routes/auth.js). Ngược lại: chế độ DEMO chỉ bật khi NODE_ENV khai
 * rõ là development hoặc test; mọi trường hợp khác, kể cả không khai, là từ chối.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
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

const EMAIL = 'nguoi.to.giac@vi-du.vn';
let ctl;
let nodeEnvCu;
let log;
const cacHamLog = ['log', 'warn', 'error', 'info'];
const banGoc = {};

beforeEach(() => {
  if (!BO_QUA) ctl = dungCsdl(pool, { themCau: [BANG_OTP] });
  nodeEnvCu = process.env.NODE_ENV;
  log = [];
  for (const h of cacHamLog) {
    banGoc[h] = console[h];
    console[h] = (...a) => { log.push(a.map(String).join(' ')); };
  }
});
afterEach(() => {
  for (const h of cacHamLog) console[h] = banGoc[h];
  process.env.NODE_ENV = nodeEnvCu;
});

const guiMa = () => goi({ duongGoc: '/api/otp', router: otpRouter, method: 'POST', duong: '/send', body: { email: EMAIL } });
const soMa = () => ctl.db.prepare('SELECT COUNT(*) AS n FROM otp_codes').get().n;

describe('BUG-025: chưa cấu hình email thì không trả mã, không ghi email ra log', { skip: BO_QUA }, () => {
  for (const [ten, giaTri] of [['production', 'production'], ['không khai (Render không đặt NODE_ENV)', undefined], ['khai sai chữ', 'prod']]) {
    test(`NODE_ENV ${ten}: từ chối 503, không có mã trong phản hồi, không tạo mã, log không có email`, async () => {
      if (giaTri === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = giaTri;
      const r = await guiMa();
      assert.equal(r.status, 503, `phải từ chối, nhận ${r.status}: ${r.text}`);
      assert.equal(r.body?.devCode, undefined, 'mã xác thực lọt ra phản hồi');
      assert.doesNotMatch(r.text, /\b\d{6}\b/, 'phản hồi có chuỗi 6 chữ số');
      assert.equal(soMa(), 0, 'không được tạo mã khi không gửi được');
      assert.ok(!log.some((d) => d.includes(EMAIL)), `email người gửi lọt vào log: ${log.join(' | ')}`);
    });
  }

  test('NODE_ENV=development (máy cá nhân, khai rõ): chế độ DEMO vẫn chạy, nhưng log không có email', async () => {
    process.env.NODE_ENV = 'development';
    const r = await guiMa();
    assert.equal(r.status, 200, r.text);
    assert.match(String(r.body?.devCode), /^\d{6}$/);
    assert.equal(soMa(), 1);
    assert.ok(!log.some((d) => d.includes(EMAIL)), `email lọt vào log: ${log.join(' | ')}`);
  });
});
