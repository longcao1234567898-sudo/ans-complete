/**
 * TÊN GÕ BIẾN THỂ KHÔNG LÁCH ĐƯỢC BỘ ĐẾM, KHÔNG LỘ TÊN CÓ THẬT (BUG-056, BUG-057)
 *
 * Cột staff.username dùng utf8mb4_unicode_ci: MySQL so tên bỏ qua hoa thường, dấu, ký tự điều
 * khiển (U+0000–U+0008, U+007F), ký tự vô hình, và coi chữ số các hệ chữ khác (٩ ९ ๙) bằng 9.
 *
 * - BUG-056 (sinh ra bởi bản vá BUG-054): khoá bộ đếm chỉ hạ chữ thường -> 'cánbo9' là bộ đếm mới,
 *   lách được ô xác minh của canbo9.
 * - BUG-057 (sinh ra bởi bản vá BUG-056, RETEST độc lập đo trên MariaDB thật): bản vá bắt chước
 *   collation bằng JavaScript nhưng bắt chước THIẾU (ký tự điều khiển, chữ số hệ khác) -> tên có
 *   thật đếm theo tên gốc, tên không có đếm theo bản bắt chước: 3 lần sai với X rồi lần 4 với
 *   X + U+0001 cho phản hồi khác nhau giữa tên có và không có — dò được tên cán bộ.
 *
 * Test giả lập cách MySQL so khi câu tra tài khoản để collation của cột quyết định (`WHERE
 * username = ?`): đổi đúng câu đó sang so qua hàm GOP_MYSQL. Câu so TỪNG BYTE thì SQLite chạy
 * nguyên như MySQL.
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

/* Gần đúng utf8mb4_unicode_ci đủ cho các biến thể dưới đây (PAD SPACE: bỏ khoảng trắng cuối) */
const SO_KHONG = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xe50];
function gopNhuMysql(s) {
  if (s == null) return null;
  return String(s).normalize('NFKD')
    .replace(/[\p{M}\p{Cc}\p{Cf}]/gu, '')
    .replace(/\p{Nd}/gu, (c) => {
      const ma = c.codePointAt(0);
      const goc = SO_KHONG.find((z) => ma >= z && ma <= z + 9);
      return goc === undefined ? c : String(ma - goc);
    })
    .toLowerCase().replace(/ +$/, '');
}

function dung() {
  const ctl = dungCsdl(pool, { themCau: [
    'ALTER TABLE staff ADD COLUMN password_hash TEXT',
    'ALTER TABLE staff ADD COLUMN failed_attempts INT DEFAULT 0',
    'ALTER TABLE staff ADD COLUMN locked_until TEXT',
    'ALTER TABLE staff ADD COLUMN last_login TEXT',
    `CREATE TABLE IF NOT EXISTS refresh_tokens (id INTEGER PRIMARY KEY, staff_id INT, token_hash TEXT,
       expires_at TEXT, revoked INT DEFAULT 0)`,
  ] });
  ctl.db.function('GOP_MYSQL', gopNhuMysql);
  const goc = pool.query;
  pool.query = (sql, p) => goc(String(sql)
    .replace(/FROM staff WHERE username = \?/g, 'FROM staff WHERE GOP_MYSQL(username) = GOP_MYSQL(?)'), p);
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

/* Các cách viết MySQL utf8mb4_unicode_ci coi là bằng 'canbo9' (đo trên MariaDB ở RETEST) */
const BIEN_THE = (t) => [t.replace('a', 'á'), t.replace('o', 'ô'), `${t}\u0001`, t.replace('b', '\u0000b'),
  t.replace('9', '٩'), t.replace('9', '९'), t.replace('9', '๙'), `${t}​`, t.replace('a', '\u0007a')];

test('đối chứng: tên gốc, viết hoa, có khoảng trắng — mật khẩu đúng thì vào được (200)', { skip: BO_QUA }, async () => {
  for (const ten of ['canbo9', 'CanBo9', '  canbo9 ']) {
    dung();
    const r = await dangNhap(ten, 'mat-khau-dung-9');
    assert.equal(r.status, 200, `"${ten}" + mật khẩu đúng không vào được (${r.status}) — đăng nhập hỏng`);
  }
});

test('BUG-057: dò tên bằng biến thể — tên CÓ THẬT và tên KHÔNG CÓ cho phản hồi giống hệt', { skip: BO_QUA }, async () => {
  const chuoi = async (ten, bienThe) => {
    dung();
    const kq = [];
    for (let i = 0; i < 3; i++) kq.push(await dangNhap(ten, `sai-${i}`));
    kq.push(await dangNhap(bienThe, 'sai-4'));
    return kq;
  };
  const coThat = BIEN_THE('canbo9');
  const khongCo = BIEN_THE('xanbo9');   // cùng các chữ cần thay -> biến thể tương ứng
  for (let i = 0; i < coThat.length; i++) {
    const co = await chuoi('canbo9', coThat[i]);
    const khong = await chuoi('xanbo9', khongCo[i]);
    assert.deepEqual(khong, co, `biến thể ${JSON.stringify(coThat[i])}: tên có thật và tên không có phản hồi khác nhau`);
  }
});

test('BUG-056: tài khoản thật sai 3 lần — biến thể + mật khẩu ĐÚNG, không token -> KHÔNG vào được', { skip: BO_QUA }, async () => {
  for (const ten of BIEN_THE('canbo9')) {
    dung();
    for (let i = 0; i < 3; i++) await dangNhap('canbo9', `sai-${i}`);
    const r = await dangNhap(ten, 'mat-khau-dung-9');
    assert.equal(r.status, 401, `${JSON.stringify(ten)} lách được ô xác minh của canbo9 (ra ${r.status})`);
  }
});

test('biến thể có dấu / ký tự ẩn / chữ số hệ khác không phải là tên đăng nhập: mật khẩu đúng cũng không vào', { skip: BO_QUA }, async () => {
  for (const ten of BIEN_THE('canbo9')) {
    dung();
    const r = await dangNhap(ten, 'mat-khau-dung-9');
    assert.equal(r.status, 401, `${JSON.stringify(ten)} vào được tài khoản canbo9 (ra ${r.status})`);
  }
});

test('trộn cách viết khi dò tên gốc: viết hoa / khoảng trắng cộng chung một bộ đếm', { skip: BO_QUA }, async () => {
  dung();
  for (const ten of ['CANBO9', 'canbo9 ', ' CanBo9']) await dangNhap(ten, 'sai');
  const r = await dangNhap('canbo9', 'mat-khau-dung-9');
  assert.equal(r.status, 401, 'ba lần sai dưới ba cách viết hoa/khoảng trắng không được tính chung');
  assert.equal(r.canCaptcha, true);
});
