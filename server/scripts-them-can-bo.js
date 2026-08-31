/**
 * THÊM CÁN BỘ MỚI (hoặc đổi mật khẩu cán bộ đã có).
 *
 * Làm TẤT CẢ trong một lệnh: tạo tài khoản + đặt mật khẩu + phân quyền.
 * Không cần chạy SQL thủ công.
 *
 * ===================== CÁCH DÙNG =====================
 *
 *   cd server
 *   node scripts-them-can-bo.js <tên_đăng_nhập> <mật_khẩu> "<Họ và tên>" [vai_trò] [nhóm]
 *
 * VÍ DỤ:
 *   node scripts-them-can-bo.js hung.nv MatKhau@2026 "Nguyễn Văn Hùng" manager
 *   node scripts-them-can-bo.js lan.tt MatKhau@2026 "Trần Thị Lan" handler 1
 *   node scripts-them-can-bo.js tuan.lm MatKhau@2026 "Lê Minh Tuấn"
 *
 * VAI TRÒ (không ghi thì mặc định là handler):
 *   admin    — Toàn quyền, xem nhật ký
 *   manager  — Phân công, xem nhật ký
 *   handler  — Chỉ xử lý ý kiến được giao
 *
 * NHÓM PHỤ TRÁCH (không ghi = phụ trách tất cả):
 *   1 = Tố giác tin báo    2 = Khiếu nại, tố cáo
 *   3 = Phản ánh, kiến nghị 4 = Đề xuất, thắc mắc
 *
 * XEM DANH SÁCH CÁN BỘ HIỆN CÓ:
 *   node scripts-them-can-bo.js --danh-sach
 *
 * ⚠️ LƯU Ý: file server/.env phải trỏ đúng database THẬT (Aiven/Railway),
 *    KHÔNG phải localhost — nếu không mật khẩu sẽ ghi nhầm vào máy bạn.
 * =====================================================
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './src/db.js';
import { inLoiKetNoi } from './goi-y-loi-ket-noi.js';

const ROLES = ['admin', 'manager', 'handler'];
const CATEGORY_NAMES = {
  1: 'Tố giác tin báo',
  2: 'Khiếu nại, tố cáo',
  3: 'Phản ánh, kiến nghị',
  4: 'Đề xuất, thắc mắc',
};

function huongDan() {
  console.log(`
=================== THÊM CÁN BỘ MỚI ===================

  node scripts-them-can-bo.js <tên_đăng_nhập> <mật_khẩu> "<Họ và tên>" [vai_trò] [nhóm]

VÍ DỤ:
  node scripts-them-can-bo.js hung.nv MatKhau@2026 "Nguyễn Văn Hùng" manager
  node scripts-them-can-bo.js lan.tt MatKhau@2026 "Trần Thị Lan" handler 1

VAI TRÒ:  admin | manager | handler   (mặc định: handler)
NHÓM:     1=Tố giác  2=Khiếu nại  3=Phản ánh  4=Đề xuất  (không ghi = tất cả)

XEM DANH SÁCH:
  node scripts-them-can-bo.js --danh-sach
=======================================================
`);
}

async function xemDanhSach() {
  const [rows] = await pool.query(
    `SELECT s.id, s.full_name, s.username, s.role, s.is_active, c.name AS nhom
     FROM staff s LEFT JOIN categories c ON s.assigned_category_id = c.id
     ORDER BY s.id`
  );
  console.log('\n=========== DANH SÁCH CÁN BỘ ===========\n');
  for (const r of rows) {
    const trangThai = r.is_active ? '✅' : '🔒 (đã khoá)';
    console.log(`  [${r.id}] ${r.full_name}`);
    console.log(`      Đăng nhập: ${r.username}  ·  Vai trò: ${r.role}  ${trangThai}`);
    console.log(`      Phụ trách: ${r.nhom || 'Tất cả các nhóm'}\n`);
  }
  console.log(`Tổng: ${rows.length} cán bộ\n`);
  process.exit(0);
}

// ---------- Bắt đầu ----------
const args = process.argv.slice(2);

if (args[0] === '--danh-sach' || args[0] === '--list') {
  await xemDanhSach();
}

const [username, password, fullName, role = 'handler', categoryId] = args;

if (!username || !password || !fullName) {
  console.error('\n❌ THIẾU THÔNG TIN!');
  huongDan();
  process.exit(1);
}

if (password.length < 6) {
  console.error('\n❌ Mật khẩu phải có ít nhất 6 ký tự.\n');
  process.exit(1);
}

if (!ROLES.includes(role)) {
  console.error(`\n❌ Vai trò "${role}" không hợp lệ. Chỉ được dùng: ${ROLES.join(' | ')}\n`);
  process.exit(1);
}

const catId = categoryId ? Number(categoryId) : null;
if (catId !== null && ![1, 2, 3, 4].includes(catId)) {
  console.error('\n❌ Nhóm phụ trách phải là 1, 2, 3 hoặc 4 (hoặc bỏ trống).\n');
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, 12);

  // Đã có tài khoản này chưa?
  const [exist] = await pool.query('SELECT id, full_name FROM staff WHERE username = ?', [username]);

  if (exist.length > 0) {
    // Đã có -> cập nhật (đổi mật khẩu, cập nhật thông tin)
    await pool.query(
      `UPDATE staff
       SET password_hash = ?, full_name = ?, role = ?, assigned_category_id = ?, is_active = TRUE
       WHERE username = ?`,
      [hash, fullName, role, catId, username]
    );
    console.log(`\n✅ ĐÃ CẬP NHẬT cán bộ "${username}" (tài khoản đã tồn tại từ trước).`);
  } else {
    // Chưa có -> thêm mới
    await pool.query(
      `INSERT INTO staff (full_name, username, password_hash, role, assigned_category_id, is_active)
       VALUES (?,?,?,?,?, TRUE)`,
      [fullName, username, hash, role, catId]
    );
    console.log(`\n✅ ĐÃ THÊM cán bộ mới thành công!`);
  }

  console.log('\n--------------------------------------');
  console.log(`  Họ tên:      ${fullName}`);
  console.log(`  Đăng nhập:   ${username}`);
  console.log(`  Mật khẩu:    ${password}`);
  console.log(`  Vai trò:     ${role}`);
  console.log(`  Phụ trách:   ${catId ? CATEGORY_NAMES[catId] : 'Tất cả các nhóm'}`);
  console.log('--------------------------------------');
  console.log('\n👉 Vào web, bấm "Đăng nhập cán bộ" ở cuối trang để thử.\n');

  process.exit(0);
} catch (err) {
  inLoiKetNoi(err);
  process.exit(1);
}
