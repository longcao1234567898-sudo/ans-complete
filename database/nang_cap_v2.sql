-- =====================================================================
-- NÂNG CẤP V2 — Hộp Thư An Ninh Số
-- Thêm: Mã hoá danh tính · SLA hạn xử lý · Phân công cán bộ · Địa bàn (bản đồ)
--
-- CÁCH CHẠY: HeidiSQL -> chọn database hop_thu_an_ninh_so
--            -> File -> Load SQL file -> chọn file này -> F9
--
-- AN TOÀN: KHÔNG mất dữ liệu. Chỉ thêm cột và bảng mới.
--          Chạy được nhiều lần (có IF NOT EXISTS / bỏ qua lỗi trùng).
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- 1) SLA — hạn xử lý theo từng nhóm (căn cứ quy định pháp luật)
-- ---------------------------------------------------------------
ALTER TABLE categories
    ADD COLUMN sla_days INT NOT NULL DEFAULT 15
    COMMENT 'Số ngày phải giải quyết theo quy định';

UPDATE categories SET sla_days = 20 WHERE code = 'to_giac';    -- Tố giác tội phạm: 20 ngày (BLTTHS)
UPDATE categories SET sla_days = 30 WHERE code = 'khieu_nai';  -- Khiếu nại, tố cáo: 30 ngày (Luật Khiếu nại)
UPDATE categories SET sla_days = 15 WHERE code = 'phan_anh';   -- Phản ánh, kiến nghị: 15 ngày
UPDATE categories SET sla_days = 10 WHERE code = 'de_xuat';    -- Đề xuất, thắc mắc: 10 ngày

-- ---------------------------------------------------------------
-- 2) ĐỊA BÀN — phục vụ bản đồ điểm nóng
--    ⚠️ Toạ độ dưới đây là GẦN ĐÚNG. Có thể chỉnh lại cho chính xác:
--       UPDATE wards SET lat=..., lng=... WHERE name='...';
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wards (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    lat DECIMAL(10,7) NOT NULL,
    lng DECIMAL(10,7) NOT NULL,
    display_order INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO wards (name, lat, lng, display_order) VALUES
('Phường Long Thạnh',  10.8000000, 105.2430000, 1),
('Phường Long Hưng',   10.8080000, 105.2380000, 2),
('Phường Long Châu',   10.7950000, 105.2350000, 3),
('Phường Long Phú',    10.7890000, 105.2470000, 4),
('Phường Long Sơn',    10.7820000, 105.2300000, 5),
('Xã Tân An',          10.8360000, 105.2160000, 6),
('Xã Tân Thạnh',       10.8550000, 105.1960000, 7),
('Xã Long An',         10.7700000, 105.2120000, 8),
('Xã Châu Phong',      10.7520000, 105.2570000, 9),
('Xã Phú Vĩnh',        10.7600000, 105.1900000, 10),
('Xã Vĩnh Hoà',        10.8260000, 105.1800000, 11),
('Xã Vĩnh Xương',      10.9000000, 105.1550000, 12),
('Xã Phú Lộc',         10.8780000, 105.1700000, 13),
('Xã Lê Chánh',        10.7400000, 105.2350000, 14);

-- ---------------------------------------------------------------
-- 3) SUBMISSIONS — thêm cột mới
-- ---------------------------------------------------------------

-- Nới cột danh tính để chứa chuỗi ĐÃ MÃ HOÁ (dài hơn bản gốc nhiều)
ALTER TABLE submissions
    MODIFY sender_name  VARCHAR(255) NOT NULL COMMENT 'Đã mã hoá AES-256-GCM',
    MODIFY sender_phone VARCHAR(255) NOT NULL COMMENT 'Đã mã hoá AES-256-GCM',
    MODIFY sender_email VARCHAR(255) NULL     COMMENT 'Đã mã hoá AES-256-GCM';

-- Băm SĐT để CHỐNG SPAM (vì SĐT đã mã hoá, không so sánh trực tiếp được)
ALTER TABLE submissions
    ADD COLUMN sender_phone_hash CHAR(64) NULL
    COMMENT 'SHA-256 của SĐT — dùng dò spam, không lộ số thật';

-- Hạn xử lý (SLA) — backend tự tính khi tiếp nhận
ALTER TABLE submissions
    ADD COLUMN deadline_at DATETIME NULL COMMENT 'Hạn phải giải quyết';

-- Địa bàn xảy ra vụ việc
ALTER TABLE submissions
    ADD COLUMN ward_id INT NULL;

-- Chỉ mục
ALTER TABLE submissions ADD INDEX idx_phone_hash (sender_phone_hash, created_at);
ALTER TABLE submissions ADD INDEX idx_deadline (deadline_at, status);
ALTER TABLE submissions ADD INDEX idx_ward (ward_id);
ALTER TABLE submissions ADD INDEX idx_assigned (assigned_to, status);

ALTER TABLE submissions
    ADD CONSTRAINT fk_submission_ward
    FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 4) Gán hạn xử lý + địa bàn cho 4 ý kiến DEMO (để có dữ liệu xem thử)
-- ---------------------------------------------------------------
UPDATE submissions s
JOIN categories c ON c.id = s.category_id
SET s.deadline_at = DATE_ADD(s.created_at, INTERVAL c.sla_days DAY)
WHERE s.deadline_at IS NULL;

-- Ép DEMO02 thành QUÁ HẠN để bạn nhìn thấy cảnh báo đỏ ngay
UPDATE submissions SET deadline_at = NOW() - INTERVAL 2 DAY
WHERE tracking_code = 'DEMO02';

UPDATE submissions SET ward_id = 1 WHERE tracking_code = 'DEMO01';
UPDATE submissions SET ward_id = 4 WHERE tracking_code = 'DEMO02';
UPDATE submissions SET ward_id = 2 WHERE tracking_code = 'DEMO03';
UPDATE submissions SET ward_id = 9 WHERE tracking_code = 'DEMO04';

-- ---------------------------------------------------------------
-- 5) VIEW mới: thống kê quá hạn
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS vw_sla_stats;
CREATE VIEW vw_sla_stats AS
SELECT
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL AND deadline_at < NOW())                       AS overdue_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL
        AND deadline_at >= NOW()
        AND deadline_at < NOW() + INTERVAL 3 DAY)                                  AS near_due_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing') AND assigned_to IS NULL)           AS unassigned_count;

-- ---------------------------------------------------------------
-- KIỂM TRA — chạy xong phải ra kết quả
-- ---------------------------------------------------------------
SELECT COUNT(*) AS 'So dia ban (phai la 14)' FROM wards;
SELECT code, name, sla_days FROM categories ORDER BY display_order;
SELECT * FROM vw_sla_stats;
