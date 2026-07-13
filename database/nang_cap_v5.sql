-- =====================================================================
-- NÂNG CẤP V5 — CHỐNG SPAM Ý KIẾN ẨN DANH
--
-- Vấn đề: ẩn danh không có SĐT/email để chặn -> kẻ xấu đổi IP là spam được.
-- Giải pháp: (1) hạn mức NGẶT HƠN cho ẩn danh
--            (2) HÀNG CHỜ KIỂM DUYỆT — ý kiến ẩn danh phải được cán bộ
--                duyệt mới vào quy trình xử lý chính (giống cách cơ quan
--                thật sàng lọc tin báo nặc danh).
--
-- CÁCH CHẠY: HeidiSQL -> chọn hop_thu_an_ninh_so -> Load SQL file -> F9
-- AN TOÀN: không mất dữ liệu.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- 1) Thêm 2 trạng thái mới cho hàng chờ kiểm duyệt
--    pending_review = ý kiến ẩn danh chờ cán bộ duyệt
--    spam           = cán bộ đánh dấu là tin rác
-- ---------------------------------------------------------------
ALTER TABLE submissions
    MODIFY status ENUM('pending_review','received','processing','resolved','rejected','spam')
    NOT NULL DEFAULT 'received';

-- ---------------------------------------------------------------
-- 2) Ghi lại ai duyệt / lúc nào
-- ---------------------------------------------------------------
ALTER TABLE submissions
    ADD COLUMN reviewed_by INT NULL COMMENT 'Cán bộ đã duyệt ý kiến ẩn danh',
    ADD COLUMN reviewed_at DATETIME NULL;

ALTER TABLE submissions
    ADD CONSTRAINT fk_submission_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE submissions ADD INDEX idx_pending (status, is_anonymous, created_at);

-- ---------------------------------------------------------------
-- 3) View: đếm việc chờ duyệt (hiện băng cảnh báo trên dashboard)
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS vw_review_queue;
CREATE VIEW vw_review_queue AS
SELECT
    COUNT(*) AS pending_count,
    SUM(created_at < NOW() - INTERVAL 24 HOUR) AS pending_over_24h
FROM submissions
WHERE status = 'pending_review';

-- ---------------------------------------------------------------
-- 4) Cập nhật view thống kê cũ — KHÔNG tính tin chờ duyệt / tin rác
--    (nếu không, số liệu báo cáo bị thổi phồng bởi tin rác)
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS vw_sla_stats;
CREATE VIEW vw_sla_stats AS
SELECT
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL AND deadline_at < NOW())              AS overdue_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL AND deadline_at >= NOW()
        AND deadline_at < NOW() + INTERVAL 3 DAY)                         AS near_due_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing') AND assigned_to IS NULL)  AS unassigned_count,
    (SELECT COUNT(*) FROM submissions WHERE status = 'pending_review')    AS pending_review_count;

-- ---------------------------------------------------------------
-- KIỂM TRA
-- ---------------------------------------------------------------
SELECT * FROM vw_review_queue;
SELECT * FROM vw_sla_stats;
SELECT status, COUNT(*) AS so_luong FROM submissions GROUP BY status;
