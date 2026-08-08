-- =====================================================================
-- NÂNG CẤP V11 — GỘP SỰ KIỆN TRÙNG LẶP
--                "nhiều người cùng báo 1 vụ việc"
--
-- VÌ SAO CẦN: một vụ cháy, một vụ đánh nhau ngoài chợ có thể có 5-7 người
-- cùng báo trong vòng nửa tiếng. Hiện mỗi tin thành một hồ sơ riêng, cán bộ
-- mở ra 7 lần, phân công 7 lần, trả lời 7 lần cho CÙNG một việc.
--
-- CÁCH XỬ LÝ: lúc nhận tin, hệ thống so với các tin CÙNG địa bàn + CÙNG
-- nhóm xử lý trong 30 phút gần nhất. Giống nhau đủ mức thì nối vào cùng một
-- "nhóm sự kiện". Cán bộ thấy 1 dòng "7 người cùng báo" thay vì 7 hồ sơ rời.
--
-- ⚠️ KHÔNG XOÁ, KHÔNG GỘP DỮ LIỆU. Mỗi tin báo vẫn là một hồ sơ độc lập,
--    giữ nguyên mã tra cứu và danh tính riêng — bà con nào tra mã của mình
--    vẫn thấy đúng tiến độ của mình. Nhóm sự kiện chỉ là một lớp NHÌN
--    chồng lên trên, bỏ đi lúc nào cũng được mà không mất gì.
--
-- Cách chấm điểm giống nhau: xem timSuKienTrung() trong
-- server/src/lib/duplicate.js — quy tắc tự đặt, giải thích được,
-- KHÔNG gọi AI ngoài.
--
-- CHẠY: HeidiSQL -> chọn ĐÚNG database backend đang dùng -> F9
--       (xem /api/health/schema để biết database nào)
--       Chạy lại nhiều lần không báo lỗi.
--
-- YÊU CẦU TRƯỚC: đã chạy nang_cap_v2.sql (wards) và nang_cap_v7.sql (deleted_at).
-- =====================================================================

-- ---------------------------------------------------------------------
-- BƯỚC 0 — KIỂM TRA ĐÚNG DATABASE
-- ---------------------------------------------------------------------
SELECT
  DATABASE() AS dang_sua_database,
  CASE
    WHEN DATABASE() IS NULL THEN 'CHUA CHON DATABASE'
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='submissions') = 0
      THEN 'SAI DATABASE - khong co bang submissions'
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='wards') = 0
      THEN 'THIEU BANG wards - hay chay nang_cap_v2.sql truoc'
    WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='submissions'
            AND COLUMN_NAME='deleted_at') = 0
      THEN 'THIEU COT deleted_at - hay chay nang_cap_v7.sql truoc'
    ELSE 'DUNG DATABASE - chay tiep duoc'
  END AS ket_luan;


-- ---------------------------------------------------------------------
-- BƯỚC 1 — BẢNG NHÓM SỰ KIỆN
--
--   submission_count: đếm sẵn thay vì COUNT(*) mỗi lần đọc. Dashboard tải
--         danh sách này ở mỗi lần mở, đếm lại là quét cả bảng submissions.
--
--   first_submission_id: tin ĐẦU TIÊN của nhóm — dùng lấy đoạn trích hiển thị.
--         ON DELETE SET NULL: xoá vĩnh viễn tin đó thì nhóm vẫn còn, chỉ mất
--         đoạn trích. Nhóm chết theo một tin bị xoá là mất dấu cả vụ việc.
--
--   acknowledged: cán bộ đã xem nhóm này chưa. Có tin mới nối vào thì
--         backend đặt lại FALSE để nhóm nổi lên dashboard lần nữa.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ward_id INT NULL DEFAULT NULL,
    category_id INT NULL DEFAULT NULL,
    first_submission_id BIGINT NULL DEFAULT NULL,
    submission_count INT NOT NULL DEFAULT 1,
    first_reported_at DATETIME NULL DEFAULT NULL,
    last_reported_at DATETIME NULL DEFAULT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by INT NULL DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (first_submission_id) REFERENCES submissions(id) ON DELETE SET NULL,
    FOREIGN KEY (acknowledged_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_chua_xem (acknowledged, submission_count, last_reported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- BƯỚC 2 — NỐI submissions VÀO NHÓM
--
--   ON DELETE SET NULL: xoá một nhóm KHÔNG được kéo theo tin báo của dân.
--   Nhóm chỉ là lớp nhìn; mất nhóm thì các tin quay lại đứng riêng lẻ,
--   không mất mát gì.
-- ---------------------------------------------------------------------
SET @co := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND COLUMN_NAME='incident_group_id');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD COLUMN incident_group_id INT NULL DEFAULT NULL',
  'SELECT ''Cot incident_group_id da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Chỉ mục cho truy vấn "lấy toàn bộ thành viên của nhóm"
SET @co := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND INDEX_NAME='idx_incident_group');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD INDEX idx_incident_group (incident_group_id, created_at)',
  'SELECT ''Chi muc idx_incident_group da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Khoá ngoại — thêm riêng vì cột có thể đã tồn tại từ lần chạy trước
SET @co := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND CONSTRAINT_NAME='fk_submissions_incident_group');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD CONSTRAINT fk_submissions_incident_group
     FOREIGN KEY (incident_group_id) REFERENCES incident_groups(id) ON DELETE SET NULL',
  'SELECT ''Khoa ngoai fk_submissions_incident_group da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- BƯỚC 3 — CHỈ MỤC CHO KHÂU TÌM TIN CÙNG VỤ
--
--   timSuKienTrung() chạy ở MỖI lần bà con gửi ý kiến, lọc theo
--   (ward_id, category_id, created_at trong 30 phút). Không có chỉ mục này
--   thì mỗi tin báo mới là một lần quét toàn bảng — càng dùng lâu càng chậm,
--   và chậm ở đúng chỗ người dân đang chờ màn hình xác nhận.
-- ---------------------------------------------------------------------
SET @co := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
              AND INDEX_NAME='idx_ward_cat_time');
SET @sql := IF(@co=0,
  'ALTER TABLE submissions ADD INDEX idx_ward_cat_time (ward_id, category_id, created_at)',
  'SELECT ''Chi muc idx_ward_cat_time da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- =====================================================================
-- KIỂM TRA KẾT QUẢ — phải thấy DAT ở cả ba cột
-- =====================================================================
SELECT
  DATABASE() AS database_da_sua,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='incident_groups')=1
       THEN 'DAT' ELSE 'THIEU' END AS bang_incident_groups,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
               AND COLUMN_NAME='incident_group_id')=1
       THEN 'DAT' ELSE 'THIEU' END AS cot_incident_group_id,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
               AND INDEX_NAME='idx_ward_cat_time')>0
       THEN 'DAT' ELSE 'THIEU' END AS chi_muc_tim_trung;

SELECT 'HOAN TAT - nhom su kien se tu hien tren dashboard khi co tin trung' AS ket_luan;
