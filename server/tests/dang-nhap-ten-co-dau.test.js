/**
 * TÊN CÓ DẤU KHÔNG LÁCH ĐƯỢC BỘ ĐẾM LẦN SAI (BUG-056 — sinh ra bởi bản vá BUG-054)
 *
 * Cột staff.username dùng utf8mb4_unicode_ci: MySQL so tên BỎ QUA hoa thường VÀ dấu —
 * `WHERE username = 'cánbo9'` khớp tài khoản `canbo9`. Bộ đếm lần sai của BUG-054 chỉ cắt khoảng
 * trắng và hạ chữ thường, nên 'cánbo9', 'canbô9'… mỗi cách viết một bộ đếm riêng: tài khoản thật
 * đã sai 3 lần vẫn được thử tiếp (kể cả mật khẩu ĐÚNG) mà không qua ô xác minh. Bản trước BUG-054
 * đếm theo dòng staff nên không bị — bản vá đã nới lớp chặn. (RETEST độc lập phát hiện.)
 *
 * SQLite so BINARY, nên test giả lập cách so của MySQL: đăng ký hàm GOP_TEN (bỏ dấu, chữ thường,
 * bỏ khoảng trắng cuối) và đổi đúng câu tra tài khoản sang so qua hàm đó.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl } from './khung-sqlite.js';

datBienMoiTruongHopLe();
process.env.TURNSTILE_SECRET_KEY = 'khoa-thu-khong-goi-mang';
const { pool } = await import('../src/db.js');
const { default: authRouter } = await import('../src/routes/auth.js');
const { capVe } = await import('../src/lib/cong-vao.js');

/* Gần đúng utf8mb4_unicode_ci cho chữ Latin có dấu: tách dấu rồi bỏ, gập hoa thường, bỏ khoảng trắng cuối (PAD SPACE) */
const gopNhuMysql = (s) => (s == null ? null : String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ +$/, ''));

function dung() {
  const ctl = dungCsdl(pool, { themCau: [
    'ALTER TABLE staff ADD COLUMN password_hash TEXT',
    'ALTER TABLE staff ADD COLUMN failed_attempts INT DEFAULT 0',
    'ALTER TABLE staff ADD COLUMN locked_until TEXT',
    'ALTER TABLE staff ADD COLUMN last_login TEXT',
  ] });
  ctl.db.function('GOP_TEN', gopNhuMysql);
  const goc = pool.query;
  pool.query = (sql, p) => goc(String(sql).replace(/FROM staff WHERE username = \?/g, 'FROM staff WHERE GOP_TEN(username) = GOP_TEN(?)'), p);
  ctl.db.prepare('DELETE FROM staff').run();
  ctl.db.prepare(`INSERT INTO staff (id, username, full_name, role, password_hash, failed_attempts)
    VALUES (9, 'canbo9', 'Cán bộ Chín', 'handler', ?, 0)`).run(bcrypt.hashSync('mat-khau-dung-9', 4));
  return ctl;
}

let goc;
let ipSo = 0;
before(async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  sv.unref();
  goc = `http://127.0.0.1:${sv.address().port}`;
});

async function dangNhap(username, password) {
  ipSo += 1;
  const r = await fetch(`${goc}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${ipSo % 250 + 1}` },
    body: JSON.stringify({ veVaoCua: capVe(), username, password }),
  });
  let than = null;
  try { than = await r.json(); } catch { /* để trống */ }
  return { status: r.status, error: than?.error, canCaptcha: than?.canCaptcha };
}

test('đối chứng: giả lập so tên như MySQL hoạt động — "cánbo9" đúng mật khẩu (chưa sai lần nào) là vào được tài khoản canbo9', { skip: BO_QUA }, async () => {
  dung();
  const r = await dangNhap('cánbo9', 'mat-khau-dung-9');
  /* Khung test thiếu bảng refresh_tokens -> 500 ở bước cấp phiên: nghĩa là ĐÃ qua mọi lớp chặn và so mật khẩu đúng */
  assert.notEqual(r.status, 401, 'giả lập collation không khớp được tài khoản — test bên dưới vô nghĩa');
});

test('tài khoản thật sai 3 lần: gõ tên có dấu + mật khẩu ĐÚNG, không token -> vẫn phải qua ô xác minh', { skip: BO_QUA }, async () => {
  dung();
  for (let i = 0; i < 3; i++) await dangNhap('canbo9', `sai-${i}`);
  for (const ten of ['cánbo9', 'cànbo9', 'canbô9', 'CÁNBỘ9', 'canbo9 ']) {
    const r = await dangNhap(ten, 'mat-khau-dung-9');
    assert.equal(r.status, 401, `"${ten}" lách được ô xác minh của canbo9 (ra ${r.status})`);
    assert.equal(r.canCaptcha, true, ten);
  }
});

test('trộn cách viết khi dò: sai 3 lần dưới 3 tên có dấu khác nhau cũng cộng vào một bộ đếm', { skip: BO_QUA }, async () => {
  dung();
  for (const ten of ['cánbo9', 'canbô9', 'cạnbo9']) await dangNhap(ten, 'sai');
  const r = await dangNhap('canbo9', 'mat-khau-dung-9');
  assert.equal(r.status, 401, 'ba lần sai dưới ba cách viết không được tính chung');
});

test('vẫn không lộ tên: tên KHÔNG có thật cũng gộp dấu như vậy — phản hồi giống tên có thật', { skip: BO_QUA }, async () => {
  dung();
  const chuoi = async (goc, bienThe) => {
    const kq = [];
    for (let i = 0; i < 3; i++) kq.push(await dangNhap(goc, `sai-${i}`));
    kq.push(await dangNhap(bienThe, 'sai-4'));
    return kq;
  };
  const co = await chuoi('canbo9', 'cánbo9');
  dung();
  const khong = await chuoi('xyzbo9', 'xýzbo9');
  assert.deepEqual(khong, co, 'tên có thật và tên không có cho phản hồi khác nhau khi đổi dấu');
});
