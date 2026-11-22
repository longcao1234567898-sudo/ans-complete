/**
 * ĐẾM ĐĂNG NHẬP SAI CỦA CÁN BỘ PHẢI ATOMIC (BUG-052, luật 6)
 *
 * routes/auth.js đọc failed_attempts, so bcrypt (~80 ms), rồi GHI ĐÈ bằng "số đã đọc + 1".
 * N lần sai gửi song song cùng đọc một giá trị cũ, cùng ghi cùng một số -> bộ đếm chỉ tăng 1.
 * Bộ đếm này là lớp chặn theo TÀI KHOẢN (đủ 3 lần sai thì bắt qua ô "không phải người máy"),
 * bổ sung cho giới hạn theo IP — kẻ dò dùng nhiều IP gửi song song là lách được ngưỡng.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import { datBienMoiTruongHopLe } from './helpers-test.js';
import { BO_QUA, dungCsdl } from './khung-sqlite.js';

datBienMoiTruongHopLe();
delete process.env.TURNSTILE_SECRET_KEY;
const { pool } = await import('../src/db.js');
const { default: authRouter } = await import('../src/routes/auth.js');

test('5 lần sai gửi song song từ 5 IP -> failed_attempts = 5, không phải 1', { skip: BO_QUA }, async () => {
  const ctl = dungCsdl(pool, { themCau: [
    'ALTER TABLE staff ADD COLUMN password_hash TEXT',
    'ALTER TABLE staff ADD COLUMN failed_attempts INT DEFAULT 0',
    'ALTER TABLE staff ADD COLUMN locked_until TEXT',
    'ALTER TABLE staff ADD COLUMN last_login TEXT',
  ] });
  ctl.db.prepare('DELETE FROM staff').run();
  ctl.db.prepare(`INSERT INTO staff (id, username, full_name, role, password_hash, failed_attempts)
    VALUES (9, 'canbo9', 'Cán bộ Chín', 'handler', ?, 0)`).run(bcrypt.hashSync('mat-khau-dung-9', 4));

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const goi = (i) => fetch(`http://127.0.0.1:${sv.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${20 + i}` },
      body: JSON.stringify({ username: 'canbo9', password: `sai-${i}` }),
    });
    const kq = await Promise.all([0, 1, 2, 3, 4].map(goi));
    assert.ok(kq.every((r) => r.status === 401), kq.map((r) => r.status).join(','));
    const { failed_attempts: n } = ctl.db.prepare('SELECT failed_attempts FROM staff WHERE id = 9').get();
    assert.equal(n, 5, `5 lần sai song song chỉ đếm được ${n}`);
  } finally { sv.close(); }
});
