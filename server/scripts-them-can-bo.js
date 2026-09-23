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
 *   node scripts-them-can-bo.js hung.nv Tuong-Binh#2026Hiep "Nguyễn Văn Hùng" manager
 *   node scripts-them-can-bo.js lan.tt Chanh-Hiep#2026-Truc "Trần Thị Lan" handler 1
 *   node scripts-them-can-bo.js tuan.lm Dinh-Hoa#2026-Pho3 "Lê Minh Tuấn"
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
 * KHOÁ / MỞ KHOÁ TÀI KHOẢN (việc riêng, phải có chủ đích):
 *   node scripts-them-can-bo.js --khoa lan.tt
 *   node scripts-them-can-bo.js --mo-khoa lan.tt
 *
 * MẬT KHẨU phải dài ít nhất 12 ký tự, có chữ thường, chữ HOA, chữ số và ký
 * tự đặc biệt. Ví dụ đạt: Chanh-Hiep#2026-Truc
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
  node scripts-them-can-bo.js hung.nv Tuong-Binh#2026Hiep "Nguyễn Văn Hùng" manager
  node scripts-them-can-bo.js lan.tt Chanh-Hiep#2026-Truc "Trần Thị Lan" handler 1

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

/**
 * KIỂM ĐỘ MẠNH MẬT KHẨU.
 *
 * ⚠️ Trước đây chỉ đòi 6 ký tự — quá yếu cho tài khoản XEM ĐƯỢC DANH TÍNH
 *    NGƯỜI TỐ GIÁC. Mật khẩu 6 ký tự toàn chữ thường có khoảng 300 triệu tổ
 *    hợp, máy thường dò hết trong vài phút.
 *
 *    Nay đòi tối thiểu 12 ký tự, đủ bốn loại ký tự. Không phải để làm khó cán
 *    bộ: 12 ký tự trộn bốn loại cho số tổ hợp lớn gấp hàng tỉ tỉ lần, dò không
 *    nổi trong đời người.
 *
 * @returns chuỗi mô tả lỗi, hoặc null nếu mật khẩu đạt.
 */
function kiemMatKhau(mk, tenDangNhap) {
  const thieu = [];
  if (mk.length < 12) thieu.push(`dài ít nhất 12 ký tự (hiện ${mk.length})`);
  if (!/[a-z]/.test(mk)) thieu.push('có chữ thường');
  if (!/[A-Z]/.test(mk)) thieu.push('có chữ HOA');
  if (!/[0-9]/.test(mk)) thieu.push('có chữ số');
  if (!/[^A-Za-z0-9]/.test(mk)) thieu.push('có ký tự đặc biệt như @ # ! $');
  if (thieu.length) return 'Mật khẩu cần: ' + thieu.join(', ') + '.';

  /* Chứa chính tên đăng nhập thì kẻ dò đoán được ngay phần đó — tên đăng nhập
     không phải bí mật, nó hiện trong nhật ký và danh sách phân công. */
  if (tenDangNhap && mk.toLowerCase().includes(String(tenDangNhap).toLowerCase())) {
    return 'Mật khẩu không được chứa tên đăng nhập.';
  }

  /* Những mật khẩu "đủ điều kiện" nhưng ai cũng nghĩ ra đầu tiên. */
  const QUEN_THUOC = ['matkhau', 'password', 'congan', 'admin', '123456', 'qwerty', 'abc123'];
  const thuong = mk.toLowerCase();
  const trung = QUEN_THUOC.find((x) => thuong.includes(x));
  if (trung) return `Mật khẩu chứa cụm quá quen thuộc "${trung}", dễ bị đoán. Chọn cụm khác.`;

  return null;
}

/**
 * KHOÁ HOẶC MỞ KHOÁ tài khoản — việc riêng, phải gõ lệnh có chủ đích.
 *
 * Tách khỏi việc cấp mật khẩu vì hai việc này mang ý nghĩa khác hẳn nhau:
 * cấp lại mật khẩu là việc thường ngày khi cán bộ quên, còn mở khoá một tài
 * khoản đã bị khoá là QUYẾT ĐỊNH — thường tài khoản bị khoá vì vi phạm hoặc vì
 * cán bộ đã chuyển công tác.
 */
async function doiTrangThai(tenDangNhap, moKhoa) {
  const [rows] = await pool.query('SELECT id, full_name, is_active FROM staff WHERE username = ?', [tenDangNhap]);
  if (!rows.length) {
    console.error(`\n❌ Không có cán bộ nào tên đăng nhập "${tenDangNhap}".\n`);
    process.exit(1);
  }
  const cb = rows[0];
  if (Boolean(cb.is_active) === moKhoa) {
    console.log(`\nℹ️  Tài khoản "${tenDangNhap}" vốn đã ${moKhoa ? 'đang hoạt động' : 'bị khoá'}, không cần đổi.\n`);
    process.exit(0);
  }
  await pool.query('UPDATE staff SET is_active = ? WHERE id = ?', [moKhoa ? 1 : 0, cb.id]);

  /* Khoá tài khoản thì thu hồi luôn mọi phiên đăng nhập đang mở. Không làm thì
     cán bộ vừa bị khoá vẫn dùng tiếp được tới khi phiên hết hạn. */
  if (!moKhoa) {
    try { await pool.query('DELETE FROM refresh_tokens WHERE staff_id = ?', [cb.id]); }
    catch { /* bảng chưa có thì bỏ qua */ }
  }
  console.log(`\n✅ Đã ${moKhoa ? 'MỞ KHOÁ' : 'KHOÁ'} tài khoản "${tenDangNhap}" (${cb.full_name}).`);
  if (!moKhoa) console.log('   Mọi phiên đăng nhập đang mở của tài khoản này đã bị thu hồi.');
  console.log('');
  process.exit(0);
}

// ---------- Bắt đầu ----------
const args = process.argv.slice(2);

if (args[0] === '--danh-sach' || args[0] === '--list') {
  await xemDanhSach();
}
if (args[0] === '--khoa' || args[0] === '--mo-khoa') {
  if (!args[1]) {
    console.error(`\n❌ Thiếu tên đăng nhập. Ví dụ: node scripts-them-can-bo.js ${args[0]} lan.tt\n`);
    process.exit(1);
  }
  await doiTrangThai(args[1], args[0] === '--mo-khoa');
}

const [username, password, fullName, role = 'handler', categoryId] = args;

if (!username || !password || !fullName) {
  console.error('\n❌ THIẾU THÔNG TIN!');
  huongDan();
  process.exit(1);
}

const loiMatKhau = kiemMatKhau(password, username);
if (loiMatKhau) {
  console.error(`\n❌ ${loiMatKhau}\n`);
  console.error('   Ví dụ mật khẩu đạt: Chanh-Hiep#2026-Truc\n');
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
  const [exist] = await pool.query('SELECT id, full_name, is_active FROM staff WHERE username = ?', [username]);

  if (exist.length > 0) {
    /* ⚠️ KHÔNG ĐỤNG TỚI is_active KHI CẬP NHẬT.

       Lỗi cũ: câu lệnh đặt luôn is_active = TRUE. Nghĩa là một cán bộ ĐÃ BỊ
       KHOÁ — vì vi phạm, hay vì đã chuyển công tác — chỉ cần ai đó chạy lệnh
       cấp lại mật khẩu là tài khoản sống lại, không có cảnh báo gì. Người đã
       rời đơn vị lại xem được danh tính người tố giác.

       Nay cấp mật khẩu chỉ đổi mật khẩu và thông tin. Muốn mở khoá phải chạy
       lệnh --mo-khoa riêng, tức là phải CÓ CHỦ ĐÍCH. */
    await pool.query(
      `UPDATE staff
       SET password_hash = ?, full_name = ?, role = ?, assigned_category_id = ?
       WHERE username = ?`,
      [hash, fullName, role, catId, username]
    );

    /* Cấp mật khẩu mới thì thu hồi các phiên đăng nhập cũ. Lý do hay gặp nhất
       để cấp lại mật khẩu là nghi bị lộ — để phiên cũ sống thì kẻ đang giữ
       phiên đó vẫn dùng tiếp được dù mật khẩu đã đổi. */
    try { await pool.query('DELETE FROM refresh_tokens WHERE staff_id = ?', [exist[0].id]); }
    catch { /* bảng chưa có thì bỏ qua */ }

    console.log(`\n✅ ĐÃ CẬP NHẬT cán bộ "${username}" (tài khoản đã tồn tại từ trước).`);
    console.log('   Mọi phiên đăng nhập cũ của tài khoản này đã bị thu hồi.');
    if (!exist[0].is_active) {
      console.log('\n⚠️  TÀI KHOẢN NÀY ĐANG BỊ KHOÁ và VẪN BỊ KHOÁ — mật khẩu mới chưa dùng được.');
      console.log(`   Nếu đúng là cần mở lại, chạy riêng lệnh:`);
      console.log(`       node scripts-them-can-bo.js --mo-khoa ${username}`);
    }
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
  /* KHÔNG IN MẬT KHẨU RA MÀN HÌNH.
     Trước đây in nguyên văn. Chữ in ra màn hình lọt vào lịch sử dòng lệnh,
     vào nhật ký của Render, và vào ảnh chụp màn hình ai đó gửi nhờ hỏi lỗi.
     Người chạy lệnh đã tự gõ mật khẩu nên không cần xem lại. */
  console.log(`  Mật khẩu:    (đã đặt — không hiển thị để tránh lộ)`);
  console.log(`  Vai trò:     ${role}`);
  console.log(`  Phụ trách:   ${catId ? CATEGORY_NAMES[catId] : 'Tất cả các nhóm'}`);
  console.log('--------------------------------------');
  console.log('\n👉 Vào web, bấm "Đăng nhập cán bộ" ở cuối trang để thử.\n');

  process.exit(0);
} catch (err) {
  inLoiKetNoi(err);
  process.exit(1);
}
