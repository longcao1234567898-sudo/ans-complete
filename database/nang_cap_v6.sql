-- =====================================================================
-- NÂNG CẤP V6 — MỨC ĐỘ KHẨN CẤP
-- Người dân tự đánh dấu ý kiến: bình thường / quan trọng / khẩn cấp
-- -> cán bộ ưu tiên xử lý việc gấp trước.
--
-- CÁCH CHẠY: HeidiSQL -> hop_thu_an_ninh_so -> Load SQL file -> F9
-- =====================================================================
USE hop_thu_an_ninh_so;

ALTER TABLE submissions
    ADD COLUMN urgency ENUM('normal','important','urgent') NOT NULL DEFAULT 'normal'
    COMMENT 'Mức khẩn cấp do người dân tự chọn';

ALTER TABLE submissions ADD INDEX idx_urgency (urgency, status);

-- Kiểm tra
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='submissions' AND COLUMN_NAME='urgency';
