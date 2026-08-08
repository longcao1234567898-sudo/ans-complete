-- =====================================================================
-- NÂNG CẤP V11 — GỘP SỰ KIỆN TRÙNG LẶP (nhiều người cùng báo 1 vụ việc)
--
-- BÀI TOÁN: 5 người cùng thấy 1 vụ cháy, mỗi người gửi 1 ý kiến riêng.
-- Trước đây cán bộ mở hàng chờ thấy 5 dòng rời rạc, không biết là 1 vụ
-- hay 5 vụ khác nhau.
--
-- CÁCH LÀM — HOÀN TOÀN THEO LUẬT, KHÔNG DÙNG AI NGOÀI (giữ đúng nguyên
-- tắc phân loại của hệ thống — xem PHẦN V tài liệu tổng quan):
--   Ý kiến mới so với các ý kiến trong 30 phút gần nhất, CÙNG địa bàn,
--   CÙNG nhóm xử lý. Nếu độ giống nội dung (đo bằng thuật toán Jaccard
--   đã có sẵn ở server/src/lib/duplicate.js) đủ cao -> xếp chung 1 nhóm.
--   Đây là MỞ RỘNG của cơ chế chống trùng lặp đã có, không phải tính
--   năng AI mới.
--
-- Bảng mới:
--   incident_groups        — mỗi dòng là 1 "sự kiện chính"
-- Cột mới:
--   submissions.incident_group_id — ý kiến nào thuộc sự kiện nào
--
-- CHẠY: HeidiSQL -> chọn ĐÚNG database backend đang dùng -> F9
--       Chạy lại nhiều lần không báo lỗi.
-- =====================================================================

SELECT
  DATABASE() AS dang_sua_database,
  CASE
    WHEN DATABASE() IS NULL THEN 'CHUA CHON DATABASE'
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='submissions') = 0
      THEN 'SAI DATABASE - khong co bang submissions'
    ELSE 'DUNG DATABASE - chay tiep duoc'
  END AS ket_luan;

-- ---------------------------------------------------------------------
-- BƯỚC 1 — BẢNG NHÓM SỰ KIỆN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_groups (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    ward_id INT NULL,
    category_id INT NULL,
    -- Ý kiến đầu tiên trong nhóm — dùng làm tiêu đề hiển thị
    first_submission_id BIGINT NOT NULL,
    submission_count INT NOT NULL DEFAULT 1,
    first_reported_at DATETIME NOT NULL,
    last_reported_at DATETIME NOT NULL,
    -- Cán bộ đã xem/xác nhận nhóm này chưa (tắt cảnh báo trên dashboard)
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (acknowledged_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_ward_cat (ward_id, category_id),
    INDEX idx_ack (acknowledged, last_reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- BƯỚC 2 — CỘT NỐI Ý KIẾN VÀO NHÓM SỰ KIỆN
-- ---------------------------------------------------------------------
SET @co := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND COLUMN_NAME='incident_group_id');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD COLUMN incident_group_id BIGINT NULL DEFAULT NULL',
  'SELECT ''Cot incident_group_id da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @co := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND INDEX_NAME='idx_incident_group');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD INDEX idx_incident_group (incident_group_id)',
  'SELECT ''Chi muc idx_incident_group da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @co := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND CONSTRAINT_NAME='fk_submission_incident_group');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD CONSTRAINT fk_submission_incident_group
     FOREIGN KEY (incident_group_id) REFERENCES incident_groups(id) ON DELETE SET NULL',
  'SELECT ''Khoa ngoai fk_submission_incident_group da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- =====================================================================
-- KIỂM TRA KẾT QUẢ
-- =====================================================================
SELECT
  DATABASE() AS database_da_sua,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='incident_groups')=1
       THEN 'DAT' ELSE 'THIEU' END AS bang_incident_groups,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
               AND COLUMN_NAME='incident_group_id')=1
       THEN 'DAT' ELSE 'THIEU' END AS cot_incident_group_id;

SELECT 'HOAN TAT - thay du DAT o tren la thanh cong' AS ket_luan;
