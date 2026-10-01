/**
 * VIỆC 23 (ADR-003) — XÁC MINH "KHÔNG PHẢI NGƯỜI MÁY" KHI VÀO WEB, VÉ CÓ HẠN
 *
 * Bỏ ô xác minh ở form gửi ý kiến và trang đăng nhập; thay bằng MỘT bước xác
 * minh khi vào web. Chỉ chặn ở giao diện là không đủ — máy tự động gọi thẳng
 * máy chủ — nên xác minh xong máy chủ cấp VÉ có thời hạn, và KIỂM VÉ ở mọi lần
 * gửi tin, đăng nhập (ADR-003 §7.5). Chưa khai TURNSTILE_SECRET_KEY thì như
 * trước: không bắt xác minh.
 *
 * Gọi Cloudflare thật thì không chạy được ở đây: thay fetch toàn cục bằng bản
 * giả cho đúng địa chỉ kiểm tra của Turnstile.
 */
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl, goi, donCoTen } from './khung-sqlite.js';

datBienMoiTruongHopLe();

const { pool } = await import('../src/db.js');
const { default: submissionsRouter } = await import('../src/routes/submissions.js');
const { default: authRouter } = await import('../src/routes/auth.js');
const congVao = await import('../src/routes/cong-vao.js').catch(() => null);

/* Cloudflare giả: token 'that' qua, mọi token khác trượt */
const fetchThat = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('challenges.cloudflare.com')) {
      const token = new URLSearchParams(String(opts.body)).get('response');
      return new Response(JSON.stringify({ success: token === 'that' }), { headers: { 'Content-Type': 'application/json' } });
    }
    return fetchThat(url, opts);
  };
});

let ctl;
beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = 'khoa-bi-mat-turnstile-thu-nghiem';
  if (!BO_QUA) ctl = dungCsdl(pool);
});

const veThat = () => jwt.sign({ purpose: 'cong_vao' }, process.env.JWT_SECRET, { expiresIn: '6h' });
const gui = (body) => goi({ duongGoc: '/api/submissions', router: submissionsRouter, method: 'POST', duong: '/', body });
const xacMinh = (body) => goi({ duongGoc: '/api/cong-vao', router: congVao.default, method: 'POST', duong: '/xac-minh', body });

test('route cổng vào tồn tại', () => {
  assert.ok(congVao, 'thiếu src/routes/cong-vao.js');
});

test('xác minh Turnstile đúng -> nhận vé; sai hoặc thiếu -> 400, không có vé', { skip: !congVao }, async () => {
  const r = await xacMinh({ captchaToken: 'that' });
  assert.equal(r.status, 200, r.text);
  const ve = jwt.verify(r.body.ve, process.env.JWT_SECRET);
  assert.equal(ve.purpose, 'cong_vao');
  assert.ok(ve.exp - ve.iat <= 6 * 3600, 'vé sống quá 6 giờ');
  for (const body of [{ captchaToken: 'gia' }, {}, { captchaToken: ['that'] }]) {
    const x = await xacMinh(body);
    assert.equal(x.status, 400, JSON.stringify(body));
    assert.equal(x.body.ve, undefined);
  }
});

test('màn hình xác minh có đường báo tin khác: lỗi trả về nhắc 113', { skip: !congVao }, async () => {
  const x = await xacMinh({ captchaToken: 'gia' });
  assert.match(x.body.error, /113/);
});

test('gửi ý kiến không có vé -> 403 CAN_XAC_MINH, không lưu gì', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0));
  assert.equal(r.status, 403, r.text);
  assert.equal(r.body.code, 'CAN_XAC_MINH');
  assert.match(r.body.error, /113/);
  assert.equal(ctl.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 0);
});

test('gửi ý kiến với vé hợp lệ -> nhận', { skip: BO_QUA }, async () => {
  const r = await gui(donCoTen(0, { veVaoCua: veThat() }));
  assert.equal(r.status, 201, r.text.slice(0, 200));
});

test('vé giả, vé hết hạn, vé dùng sai mục đích -> 403', { skip: BO_QUA }, async () => {
  const gia = jwt.sign({ purpose: 'cong_vao' }, 'khoa-khac', { expiresIn: '6h' });
  const hetHan = jwt.sign({ purpose: 'cong_vao', iat: Math.floor(Date.now() / 1000) - 7 * 3600 }, process.env.JWT_SECRET, { expiresIn: '6h' });
  const saiMucDich = jwt.sign({ sub: 1, purpose: 'chat_reporter' }, process.env.JWT_SECRET, { expiresIn: '2h' });
  for (const ve of [gia, hetHan, saiMucDich, 'abc', { purpose: 'cong_vao' }]) {
    assert.equal((await gui(donCoTen(0, { veVaoCua: ve }))).status, 403);
  }
});

test('giao diện cũ còn gửi captchaToken hợp lệ -> vẫn nhận (khoảng chuyển đổi)', { skip: BO_QUA }, async () => {
  assert.equal((await gui(donCoTen(0, { captchaToken: 'that' }))).status, 201);
  assert.equal((await gui(donCoTen(1, { captchaToken: 'gia' }))).status, 403);
});

test('tin ẩn danh cũng phải có vé', { skip: BO_QUA }, async () => {
  const body = { isAnonymous: true, category: 'to_giac',
    content: 'Tối thứ bảy tuần trước khoảng 22 giờ tại bến sông khu phố 2 có nhóm người hút cát trái phép bằng hai tàu.' };
  assert.equal((await gui(body)).status, 403);
  assert.equal((await gui({ ...body, veVaoCua: veThat() })).status, 201);
});

test('chưa khai TURNSTILE_SECRET_KEY -> không bắt vé (như trước)', { skip: BO_QUA }, async () => {
  process.env.TURNSTILE_SECRET_KEY = '';
  assert.equal((await gui(donCoTen(0))).status, 201);
});

async function dangNhap(body) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  const sv = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${sv.address().port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } finally { sv.close(); }
}

test('đăng nhập cán bộ không có vé -> 403 CAN_XAC_MINH; có vé -> đi tiếp tới bước kiểm mật khẩu', { skip: BO_QUA }, async () => {
  /* Cột của bảng staff mà route đăng nhập đọc/ghi (TRON_BO + nang_cap_v9.sql) */
  for (const cot of ['password_hash TEXT', 'failed_attempts INT DEFAULT 0', 'locked_until TEXT', 'sessions_valid_from TEXT']) {
    ctl.db.exec(`ALTER TABLE staff ADD COLUMN ${cot}`);
  }
  const khong = await dangNhap({ username: 'cb4', password: 'sai-mat-khau' });
  assert.equal(khong.status, 403);
  assert.equal(khong.body.code, 'CAN_XAC_MINH');
  const co = await dangNhap({ username: 'cb4', password: 'sai-mat-khau', veVaoCua: veThat() });
  assert.equal(co.status, 401, 'có vé thì phải tới bước kiểm mật khẩu (sai -> 401)');
});

test('cả ba biến thể khởi động máy chủ đều gắn /api/cong-vao', async () => {
  for (const tep of ['index.js', 'may-chu-cong-khai.js', 'may-chu-can-bo.js']) {
    const nguon = await readFile(new URL(`../src/${tep}`, import.meta.url), 'utf8');
    assert.match(nguon, /app\.use\('\/api\/cong-vao'/, `${tep} thiếu route cổng vào — trang đó không lấy được vé`);
  }
});
