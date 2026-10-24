SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V39 — NHÃN "ĐÃ XÁC MINH SỐ ĐIỆN THOẠI" CHO TIN CÓ DANH TÍNH (P89)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO CỘT MỚI: cột cũ is_verified_otp ghi 1 cho MỌI tin có tên (thực chất là
-- "có danh tính"), dùng lại thì mọi tin cũ hiện "đã xác minh". Cột mới:
--   NULL = tin gửi trước khi có tính năng / tin ẩn danh
--   0    = có tên, người gửi KHÔNG nhập mã xác nhận gửi về số
--   1    = người gửi đã nhập đúng mã gửi về số đó (Zalo/SMS) — là chủ số
--
-- Chưa chạy tệp này thì máy chủ vẫn nhận ý kiến bình thường, chỉ không lưu nhãn.
-- Chạy lại nhiều lần không sao. QUYỀN: cần quyền ALTER trên bảng submissions.
-- ============================================================================

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN sdt_xac_minh TINYINT(1) NULL DEFAULT NULL COMMENT ''1 = người gửi đã nhập đúng mã gửi về số (Zalo/SMS) — P89''',
    'SELECT ''cột sdt_xac_minh đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'sdt_xac_minh'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
