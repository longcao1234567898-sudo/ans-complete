/**
 * Tạo/đổi mật khẩu tài khoản admin (chạy MỘT LẦN sau khi import database).
 * Dùng: node scripts-create-admin.js <mật_khẩu_mới>
 * Ví dụ: node scripts-create-admin.js MatKhau@2026
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './src/db.js';

const password = process.argv[2];
if (!password || password.length < 6) {
  console.error('❌ Vui lòng nhập mật khẩu tối thiểu 6 ký tự:');
  console.error('   node scripts-create-admin.js MatKhauCuaBan@2026');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
await pool.query('UPDATE staff SET password_hash = ? WHERE username = ?', [hash, 'admin']);
console.log('✅ Đã đặt mật khẩu cho tài khoản "admin".');
console.log('   Đăng nhập bằng: username = admin, password = ' + password);
process.exit(0);
