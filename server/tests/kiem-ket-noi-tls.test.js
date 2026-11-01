/**
 * TỆP LỆNH CHẨN ĐOÁN KẾT NỐI KHÔNG ĐƯỢC TRAO MẬT KHẨU CSDL CHO KẺ ĐỨNG GIỮA (BUG-046)
 *
 * RETEST P103 (BUG-033 Fixed ở db.js) chỉ ra scripts-kiem-ket-noi.js tự dựng cấu hình TLS riêng,
 * không kiểm tên máy — đúng lỗ BUG-033, mà vẫn gửi DB_USER/DB_PASSWORD. Bước "so sánh chứng chỉ"
 * còn nối lại với rejectUnauthorized:false KÈM mật khẩu, và chạy đúng lúc nghi có kẻ chen giữa.
 * Sửa: bước nối dùng chung buildSsl() của db.js; bước xem chứng chỉ chỉ bắt tay TLS, không đăng nhập.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const nguon = async () => boChuThich(await readFile(new URL('../scripts-kiem-ket-noi.js', import.meta.url), 'utf8'));

/* Mọi khối { ... } truyền vào createConnection */
function cacLanNoi(s) {
  const kq = [];
  let i = s.indexOf('createConnection(');
  while (i >= 0) {
    let j = s.indexOf('{', i); let sau = 0; let k = j;
    for (; k < s.length; k++) { if (s[k] === '{') sau++; else if (s[k] === '}' && --sau === 0) break; }
    kq.push(s.slice(j, k + 1));
    i = s.indexOf('createConnection(', k);
  }
  return kq;
}

test('bước nối dùng chung buildSsl() của db.js (có kiểm tên máy), không tự dựng cấu hình TLS', async () => {
  const s = await nguon();
  assert.match(s, /import\s*\{[^}]*\bbuildSsl\b[^}]*\}\s*from\s*'\.\/src\/db\.js'/, 'chưa nạp buildSsl từ ./src/db.js');
  assert.doesNotMatch(s, /function\s+dungSsl/, 'còn hàm dựng TLS riêng');
  for (const k of cacLanNoi(s).filter((x) => /password/.test(x))) {
    assert.match(k, /ssl:\s*buildSsl\(\)/, `lần nối có mật khẩu mà không dùng buildSsl(): ${k.slice(0, 120)}`);
  }
});

test('không lần nối nào vừa tắt kiểm chứng chỉ vừa gửi tài khoản / mật khẩu', async () => {
  const s = await nguon();
  for (const k of cacLanNoi(s)) {
    if (/rejectUnauthorized:\s*false/.test(k)) {
      assert.doesNotMatch(k, /password|user:/, `tắt kiểm chứng chỉ mà vẫn đăng nhập: ${k.slice(0, 160)}`);
    }
  }
});
