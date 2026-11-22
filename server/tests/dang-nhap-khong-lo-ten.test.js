/**
 * ĐĂNG NHẬP KHÔNG ĐỂ LỘ TÊN TÀI KHOẢN NÀO CÓ THẬT (BUG-054)
 *
 * Bộ đếm lần sai (để bắt ô "không phải người máy" từ lần sai thứ 3) chỉ có ở tài khoản CÓ THẬT
 * (staff.failed_attempts). Tên không có thật luôn đếm 0. Hệ quả: cùng một chuỗi thao tác, phản hồi
 * khác nhau — lần sai thứ 3 có canCaptcha: true hay không, lần thứ 4 báo "tích vào ô xác minh"
 * (trả về trước cả bcrypt) hay "sai tên hoặc mật khẩu". Kẻ dò biết tên nào là cán bộ thật.
 *
 * Cách đúng: đếm theo TÊN ĐÃ GÕ, như nhau cho tên có và không có — vẫn giữ nguyên sức chặn cho tài
 * khoản thật. Kèm: mật khẩu không phải chuỗi làm bcryptjs ném lỗi -> 500.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl } from './khung-sqlite.js';

datBienMoiTruongHopLe();
process.env.TURNSTILE_SECRET_KEY = 'khoa-thu-khong-goi-mang';   // bật nhánh bắt ô xác minh
const { pool } = await import('../src/db.js');
const { default: authRouter } = await import('../src/routes/auth.js');
const { capVe } = await import('../src/lib/cong-vao.js');

let ctl;
let ipSo = 0;
function dung() {
  ctl = dungCsdl(pool, { themCau: [
    'ALTER TABLE staff ADD COLUMN password_hash TEXT',
    'ALTER TABLE staff ADD COLUMN failed_attempts INT DEFAULT 0',
    'ALTER TABLE staff ADD COLUMN locked_until TEXT',
    'ALTER TABLE staff ADD COLUMN last_login TEXT',
  ] });
  ctl.db.prepare('DELETE FROM staff').run();
  ctl.db.prepare(`INSERT INTO staff (id, username, full_name, role, password_hash, failed_attempts)
    VALUES (9, 'canbo9', 'Cán bộ Chín', 'handler', ?, 0)`).run(bcrypt.hashSync('mat-khau-dung-9', 4));
}

let goc;
before(async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  sv.unref();
  goc = `http://127.0.0.1:${sv.address().port}`;
});

/* Mỗi lượt một IP mới: loginLimiter 5 lượt/15 phút/IP không được che mất khác biệt cần đo */
async function dangNhap(body) {
  ipSo += 1;
  const r = await fetch(`${goc}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${ipSo % 250 + 1}` },
    body: JSON.stringify({ veVaoCua: capVe(), ...body }),
  });
  let than = null;
  try { than = await r.json(); } catch { /* để trống */ }
  return { status: r.status, error: than?.error, canCaptcha: than?.canCaptcha };
}

test('cùng chuỗi 4 lần sai: tên CÓ THẬT và tên KHÔNG CÓ nhận phản hồi giống hệt nhau', { skip: BO_QUA }, async () => {
  dung();
  const kq = {};
  for (const ten of ['canbo9', 'khong-co-ai-ten-nay']) {
    kq[ten] = [];
    for (let i = 0; i < 4; i++) kq[ten].push(await dangNhap({ username: ten, password: `sai-${i}` }));
  }
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(kq['khong-co-ai-ten-nay'][i], kq.canbo9[i],
      `lần thứ ${i + 1}: phản hồi khác nhau giữa tên có thật và tên không có — dò được tên cán bộ`);
  }
});

test('không nới sức chặn: tài khoản thật sai 3 lần thì lần sau phải qua ô xác minh, kể cả gõ ĐÚNG mật khẩu', { skip: BO_QUA }, async () => {
  dung();
  for (let i = 0; i < 3; i++) await dangNhap({ username: 'canbo9', password: `sai-${i}` });
  const r = await dangNhap({ username: 'canbo9', password: 'mat-khau-dung-9' });
  assert.equal(r.status, 401, 'sai 3 lần rồi vào thẳng được không cần ô xác minh');
  assert.equal(r.canCaptcha, true);
});

test('viết hoa / thêm dấu cách vẫn là cùng một tên (MySQL so không phân biệt hoa thường)', { skip: BO_QUA }, async () => {
  dung();
  for (const ten of ['canbo9', 'CanBo9', ' canbo9 ']) await dangNhap({ username: ten, password: 'sai' });
  /* Ba lần sai dưới ba cách viết phải cộng vào CÙNG một bộ đếm -> lần sau phải qua ô xác minh */
  const r = await dangNhap({ username: 'canbo9', password: 'mat-khau-dung-9' });
  assert.equal(r.status, 401, 'đổi cách viết tên là thoát bộ đếm lần sai');
  assert.equal(r.canCaptcha, true);
});

test('mật khẩu / tên không phải chuỗi: 400 như thiếu trường, không 500', { skip: BO_QUA }, async () => {
  dung();
  for (const b of [{ username: 'canbo9', password: ['a'] }, { username: 'canbo9', password: { x: 1 } },
    { username: ['canbo9'], password: 'x' }, { username: 'canbo9', password: 'a'.repeat(5000) }]) {
    const r = await dangNhap(b);
    assert.equal(r.status, 400, `${JSON.stringify(b).slice(0, 60)} -> ${r.status}`);
  }
});
