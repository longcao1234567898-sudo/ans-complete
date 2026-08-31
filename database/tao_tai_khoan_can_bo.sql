-- ============================================================================
-- TẠO TÀI KHOẢN CÁN BỘ BẰNG SQL (dán vào HeidiSQL)
-- ============================================================================
--
-- Dùng khi chưa chạy được scripts-them-can-bo.js (đang vướng lỗi chứng chỉ).
-- HeidiSQL nối được database nên chạy đường này vẫn tạo tài khoản bình thường.
--
-- CÁCH CHẠY: mở HeidiSQL → chọn đúng database hop_thu_an_ninh_so
--            → dán toàn bộ tệp này vào ô truy vấn → bấm F9.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │  TÀI KHOẢN SẼ ĐƯỢC TẠO                                                   │
-- │    Tên đăng nhập : thienloc                                              │
-- │    Mật khẩu      : nckh@2026                                             │
-- │    Họ và tên     : Nguyễn Thiên Lộc                                      │
-- │    Vai trò       : handler (chỉ xử lý ý kiến được giao)                  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- VỀ CHUỖI password_hash BÊN DƯỚI: đây là mật khẩu đã băm bằng bcrypt (cùng
-- thuật toán và độ mạnh mà máy chủ dùng), KHÔNG phải mật khẩu thô. Database
-- không bao giờ lưu mật khẩu thật — kể cả người xem được database cũng không
-- suy ngược ra mật khẩu. Chuỗi này đã được kiểm tra khớp với "nckh@2026".
--
-- ⚠️ Mật khẩu nckh@2026 khá dễ đoán. Nếu tài khoản dùng thật chứ không chỉ để
--    demo, nên đổi mật khẩu mạnh hơn sau khi đăng nhập lần đầu.
-- ============================================================================

INSERT INTO staff (full_name, username, password_hash, role, is_active)
VALUES (
  N'Nguyễn Thiên Lộc',
  'thienloc',
  '$2b$12$8u83O7xg4lyqjKkl4GNwNerxvZSBk6Ws.22t0lwvG7UMRUo6Dzv2m',
  'handler',
  TRUE
)
-- Nếu tên đăng nhập đã tồn tại thì CẬP NHẬT lại thay vì báo lỗi trùng.
ON DUPLICATE KEY UPDATE
  full_name     = VALUES(full_name),
  password_hash = VALUES(password_hash),
  role          = VALUES(role),
  is_active     = TRUE;


-- ============================================================================
-- KIỂM TRA SAU KHI CHẠY — chạy riêng câu dưới để xem tài khoản đã vào chưa
-- ============================================================================
SELECT id, username, full_name, role, is_active, created_at
  FROM staff
 ORDER BY id DESC
 LIMIT 5;


-- ============================================================================
-- PHỤ LỤC — muốn tạo cán bộ KHÁC thì sửa mẫu dưới đây
-- ============================================================================
--
-- KHÔNG tự gõ password_hash theo kiểu đoán — mỗi mật khẩu có một chuỗi băm
-- riêng, gõ bừa sẽ không đăng nhập được. Lấy chuỗi băm bằng một trong hai cách:
--
--   Cách 1 (khuyên dùng, sau khi sửa xong lỗi chứng chỉ):
--     cd server
--     node scripts-them-can-bo.js <tên_đăng_nhập> <mật_khẩu> "<Họ và tên>" <vai_trò>
--
--   Cách 2 (tạo riêng chuỗi băm để dán vào SQL):
--     cd server
--     node -e "console.log(require('bcryptjs').hashSync('MatKhauCuaBan', 12))"
--
-- VAI TRÒ:
--   admin    — toàn quyền, xem nhật ký, xuất dữ liệu, đặt cấp độ mật
--   manager  — phân công, xem nhật ký, xuất dữ liệu, đặt cấp độ mật
--   handler  — chỉ xử lý ý kiến được giao
--
-- MẪU:
-- INSERT INTO staff (full_name, username, password_hash, role, is_active)
-- VALUES (N'Họ Và Tên', 'ten_dang_nhap', '<chuỗi_băm_lấy_từ_lệnh_trên>', 'handler', TRUE)
-- ON DUPLICATE KEY UPDATE
--   full_name = VALUES(full_name), password_hash = VALUES(password_hash),
--   role = VALUES(role), is_active = TRUE;
