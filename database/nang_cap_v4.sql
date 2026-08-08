-- =====================================================================
-- NÂNG CẤP V4 — GỬI Ý KIẾN ẨN DANH
--
-- Căn cứ nghiệp vụ: người tố giác sợ bị trả thù nên không dám cung cấp
-- danh tính. Luật Tố cáo quy định bảo vệ người tố cáo. Cho phép gửi
-- ẩn danh giúp thu thập được nguồn tin mà kênh truyền thống bỏ lỡ.
--
-- CÁCH CHẠY: HeidiSQL -> chọn hop_thu_an_ninh_so -> Load SQL file -> F9
-- AN TOÀN: không mất dữ liệu, chỉ thêm 1 cột + nới ràng buộc.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- 1) Cột đánh dấu ý kiến ẩn danh
ALTER TABLE submissions
    ADD COLUMN is_anonymous BOOLEAN DEFAULT FALSE
    COMMENT 'TRUE = người gửi chọn ẩn danh, không cung cấp danh tính';

-- 2) Cho phép danh tính NULL (ý kiến ẩn danh không có tên/SĐT)
ALTER TABLE submissions
    MODIFY sender_name  VARCHAR(255) NULL,
    MODIFY sender_phone VARCHAR(255) NULL;

-- KIỂM TRA
SELECT COLUMN_NAME, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='submissions'
  AND COLUMN_NAME IN ('is_anonymous','sender_name','sender_phone');
