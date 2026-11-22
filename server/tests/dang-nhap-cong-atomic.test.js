/**
 * CỔNG BẮT Ô XÁC MINH PHẢI GIÀNH LƯỢT TRƯỚC KHI SO MẬT KHẨU (BUG-052 lần 2, luật 6)
 *
 * RETEST độc lập kết luận BUG-052 "chưa fix triệt để": mỗi lần TĂNG bộ đếm đã atomic, nhưng QUYẾT
 * ĐỊNH có bắt ô xác minh hay không vẫn "đọc rồi mới làm" — đọc số lần sai, so bcrypt (~200 ms với
 * cost 12), rồi mới tăng. N lượt sai gửi song song cùng đọc thấy "chưa tới 3", cùng được so mật
 * khẩu không cần ô xác minh: 12 lượt song song thì 6 lượt lọt. Kẻ dò nhiều IP lách được ngưỡng.
 */
import { test } from 'node:test';
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

const LOI_SAI = 'Tên đăng nhập hoặc mật khẩu không đúng.';

test('12 lượt sai song song từ 12 IP: nhiều nhất 3 lượt được so mật khẩu không qua ô xác minh', { skip: BO_QUA }, async () => {
  const ctl = dungCsdl(pool, { themCau: [
    'ALTER TABLE staff ADD COLUMN password_hash TEXT',
    'ALTER TABLE staff ADD COLUMN failed_attempts INT DEFAULT 0',
    'ALTER TABLE staff ADD COLUMN locked_until TEXT',
    'ALTER TABLE staff ADD COLUMN last_login TEXT',
  ] });
  ctl.db.prepare('DELETE FROM staff').run();
  ctl.db.prepare(`INSERT INTO staff (id, username, full_name, role, password_hash, failed_attempts)
    VALUES (9, 'canbo9', 'Cán bộ Chín', 'handler', ?, 0)`).run(bcrypt.hashSync('mat-khau-dung-9', 12));

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const goi = (i) => fetch(`http://127.0.0.1:${sv.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${40 + i}` },
      body: JSON.stringify({ veVaoCua: capVe(), username: 'canbo9', password: `sai-${i}` }),
    }).then((r) => r.json());
    const kq = await Promise.all(Array.from({ length: 12 }, (_, i) => goi(i)));
    const daSo = kq.filter((b) => b.error === LOI_SAI).length;
    assert.ok(daSo <= 3, `${daSo}/12 lượt được so mật khẩu mà không qua ô xác minh (ngưỡng 3)`);
    assert.ok(kq.every((b) => b.canCaptcha === true || b.error === LOI_SAI), JSON.stringify(kq.slice(0, 3)));
  } finally { sv.close(); }
});
