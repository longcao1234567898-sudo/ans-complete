SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V32 — SỬA: TỆP WORD (.docx) NGƯỜI DÂN GỬI KÈM BỊ MẤT KHI LƯU
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- LỖI: cột submission_images.mime_type là VARCHAR(50), mà kiểu tệp Word
--   application/vnd.openxmlformats-officedocument.wordprocessingml.document
-- dài 71 ký tự. MySQL ở chế độ chặt (mặc định của MySQL 8 và MariaDB) từ chối
-- cả dòng. Máy chủ bắt lỗi và bỏ qua để không chặn ý kiến, nên tệp Word — và mọi
-- tài liệu xếp sau nó trong cùng tin — KHÔNG được lưu, trong khi người dân vẫn
-- thấy "gửi thành công". PDF và ảnh không bị (kiểu tệp ngắn).
--
-- SỬA: nới cột lên VARCHAR(100). Tệp Word đã mất trước đây KHÔNG lấy lại được.
--
-- THỜI ĐIỂM: chạy càng sớm càng tốt — trước khi chạy, tệp Word gửi kèm vẫn mất.
-- Chạy lại nhiều lần không báo lỗi: cột đã đủ dài thì bỏ qua (không dựng lại bảng).
-- Bảng submission_images chứa cả ảnh base64 nên lần đầu có thể mất vài giây.
-- ============================================================================

SET @sql = (
  SELECT IF(MAX(character_maximum_length) < 100,
    'ALTER TABLE submission_images MODIFY COLUMN mime_type VARCHAR(100) NULL DEFAULT NULL',
    'SELECT ''cột mime_type đã đủ dài, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submission_images' AND column_name = 'mime_type'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- KIỂM TRA: phải ra mime_type | varchar(100)
SELECT column_name AS cot, column_type AS kieu
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'submission_images' AND column_name = 'mime_type';
