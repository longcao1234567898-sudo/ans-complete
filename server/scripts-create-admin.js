/**
 * Tạo/đổi mật khẩu tài khoản admin (chạy MỘT LẦN sau khi import database).
 * Dùng: node scripts-create-admin.js <mật_khẩu_mới>
 * Mật khẩu theo luật chung src/lib/mat-khau.js: ≥ 12 ký tự, đủ chữ thường, chữ HOA,
 * chữ số, ký tự đặc biệt; không chứa "admin" hay cụm quen thuộc.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './src/db.js';
import { inLoiKetNoi } from './goi-y-loi-ket-noi.js';
import { kiemMatKhau } from './src/lib/mat-khau.js';

const password = process.argv[2] || '';
/* Cùng luật với scripts-them-can-bo.js (BUG-027): `admin` là tài khoản quyền
   cao nhất, không được dễ hơn tài khoản cán bộ. Kiểm TRƯỚC khi chạm CSDL. */
const loiMatKhau = kiemMatKhau(password, 'admin');
if (loiMatKhau) {
  console.error('❌ ' + loiMatKhau);
  console.error('   Ví dụ: node scripts-create-admin.js "Tr@mXanh#2026q"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
try {
  await pool.query('UPDATE staff SET password_hash = ? WHERE username = ?', [hash, 'admin']);
  /* Không in lại mật khẩu: màn hình và log terminal không phải chỗ giữ nó. */
  console.log('✅ Đã đặt mật khẩu cho tài khoản "admin" (đăng nhập bằng username = admin).');
  process.exit(0);
} catch (err) {
  inLoiKetNoi(err);
  process.exit(1);
}
