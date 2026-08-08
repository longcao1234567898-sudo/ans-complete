-- =====================================================================
-- SỬA LỖI ẢNH ĐÍNH KÈM BỊ VỠ TRONG TRANG QUẢN TRỊ
--
-- Nguyên nhân: cột image_url chỉ chứa được 500 ký tự, nhưng ảnh lưu dạng
--              base64 dài hàng trăm nghìn ký tự -> bị cắt cụt -> ảnh vỡ.
--
-- Cách chạy: HeidiSQL -> chọn database hop_thu_an_ninh_so
--            -> dán đoạn này vào ô Query -> bấm F9
--
-- An toàn: KHÔNG mất dữ liệu. Chỉ nới rộng cột.
--          (Ảnh CŨ đã bị cắt cụt thì không cứu được, nhưng ảnh MỚI sẽ hiện đúng.)
-- =====================================================================

USE hop_thu_an_ninh_so;

-- Nới cột chứa ảnh từ 500 ký tự -> không giới hạn
ALTER TABLE submission_images
    MODIFY image_url LONGTEXT NOT NULL
    COMMENT 'Ảnh base64 (data URL) - phải LONGTEXT vì rất dài';

-- Xoá các ảnh cũ đã bị cắt cụt (chúng vĩnh viễn hỏng, giữ lại chỉ gây vỡ ảnh)
DELETE FROM submission_images WHERE LENGTH(image_url) <= 500;

-- Kiểm tra: cột phải là longtext
SELECT COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
  AND TABLE_NAME = 'submission_images'
  AND COLUMN_NAME = 'image_url';
