-- =====================================================================
-- NÂNG CẤP V7 — THÙNG RÁC (xoá mềm, giữ 7 ngày rồi mới xoá hẳn)
--
-- VÌ SAO CẦN: cán bộ lỡ tay bấm "Tin rác" là mất luôn tin báo, không lấy
-- lại được. Có thùng rác thì trong 7 ngày vẫn khôi phục được.
-- Quá 7 ngày hệ thống tự xoá vĩnh viễn (đỡ phình database).
--
-- CÁCH CHẠY: HeidiSQL -> hop_thu_an_ninh_so -> Load SQL file -> F9
-- =====================================================================
USE hop_thu_an_ninh_so;

-- Thời điểm bị đưa vào thùng rác. NULL = không nằm trong thùng rác.
ALTER TABLE submissions
    ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL
    COMMENT 'Thời điểm đưa vào thùng rác; tự xoá hẳn sau 7 ngày';

-- Ai là người đưa vào thùng rác (truy trách nhiệm)
ALTER TABLE submissions
    ADD COLUMN deleted_by INT NULL DEFAULT NULL
    COMMENT 'ID cán bộ đã đưa vào thùng rác';

ALTER TABLE submissions ADD INDEX idx_deleted_at (deleted_at);

-- View: thùng rác kèm số ngày còn lại trước khi xoá hẳn
DROP VIEW IF EXISTS vw_trash;
CREATE VIEW vw_trash AS
SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
       s.status, s.is_anonymous, s.created_at, s.deleted_at, s.deleted_by,
       st.full_name AS deleted_by_name,
       c.name AS category_name, c.code AS category_code,
       DATEDIFF(DATE_ADD(s.deleted_at, INTERVAL 7 DAY), NOW()) AS days_left
FROM submissions s
LEFT JOIN staff st ON st.id = s.deleted_by
LEFT JOIN categories c ON c.id = s.category_id
WHERE s.deleted_at IS NOT NULL
ORDER BY s.deleted_at DESC;

-- =====================================================================
-- SỬA LỖI: bảng status_history chưa nhận trạng thái mới
-- Triệu chứng: bấm Duyệt / Tin rác báo "Lỗi máy chủ", refresh mới thấy đã chạy.
-- Nguyên nhân: ENUM của status_history còn thiếu 'pending_review' và 'spam'
--              -> lệnh ghi lịch sử bị lỗi SAU KHI đã cập nhật trạng thái.
-- =====================================================================
ALTER TABLE status_history
    MODIFY COLUMN old_status ENUM('pending_review','received','processing','resolved','rejected','spam') NULL;

ALTER TABLE status_history
    MODIFY COLUMN new_status ENUM('pending_review','received','processing','resolved','rejected','spam') NOT NULL;


-- Kiểm tra
SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='status_history'
  AND COLUMN_NAME IN ('old_status','new_status');

SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='submissions'
  AND COLUMN_NAME IN ('deleted_at','deleted_by');

SELECT COUNT(*) AS so_tin_trong_thung_rac FROM vw_trash;
