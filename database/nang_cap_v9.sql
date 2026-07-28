-- =====================================================================
-- NÂNG CẤP V9 — TĂNG CƯỜNG BẢO MẬT ĐĂNG NHẬP CÁN BỘ
--
-- BA LỖ HỔNG ĐƯỢC VÁ:
--   1. Không ghi nhật ký lần đăng nhập THẤT BẠI
--      -> không phát hiện được khi đang bị tấn công dò mật khẩu
--
--   2. Không khoá tài khoản sau nhiều lần sai
--      -> giới hạn 5 lần/15 phút chỉ tính theo IP. Kẻ tấn công có
--         100 địa chỉ IP là thử được 500 mật khẩu mà không bị chặn.
--
--   3. Không có mốc thời gian thu hồi phiên hàng loạt
--      -> khi nghi lộ mật khẩu, không có cách buộc đăng nhập lại
--
-- CHẠY: HeidiSQL -> chọn ĐÚNG database backend đang dùng -> F9
--       (xem /api/health/schema để biết database nào)
--       Chạy lại nhiều lần không báo lỗi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BƯỚC 0 — KIỂM TRA ĐÚNG DATABASE
-- ---------------------------------------------------------------------
SELECT
  DATABASE() AS dang_sua_database,
  CASE
    WHEN DATABASE() IS NULL THEN 'CHUA CHON DATABASE'
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='staff') = 0
      THEN 'SAI DATABASE - khong co bang staff'
    ELSE 'DUNG DATABASE - chay tiep duoc'
  END AS ket_luan;


-- ---------------------------------------------------------------------
-- BƯỚC 1 — BA CỘT CHỐNG DÒ MẬT KHẨU
-- ---------------------------------------------------------------------

-- 1.1. Đếm số lần đăng nhập sai liên tiếp
SET @co := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff'
              AND COLUMN_NAME='failed_attempts');
SET @sql := IF(@co=0,
  'ALTER TABLE staff ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0',
  'SELECT ''Cot failed_attempts da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 1.2. Khoá tới thời điểm nào (NULL = không khoá)
SET @co := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff'
              AND COLUMN_NAME='locked_until');
SET @sql := IF(@co=0,
  'ALTER TABLE staff ADD COLUMN locked_until DATETIME NULL DEFAULT NULL',
  'SELECT ''Cot locked_until da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 1.3. Mốc thu hồi phiên — mọi vé cấp TRƯỚC mốc này đều mất hiệu lực.
--      Dùng khi nghi lộ mật khẩu: cập nhật mốc là buộc đăng nhập lại,
--      không cần đổi khoá JWT của cả hệ thống.
SET @co := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff'
              AND COLUMN_NAME='sessions_valid_from');
SET @sql := IF(@co=0,
  'ALTER TABLE staff ADD COLUMN sessions_valid_from DATETIME NULL DEFAULT NULL',
  'SELECT ''Cot sessions_valid_from da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- BƯỚC 2 — CHO PHÉP GHI NHẬT KÝ KHI CHƯA BIẾT LÀ AI
--
--   Đăng nhập sai tên tài khoản thì không có staff_id để ghi.
--   Nới cột staff_id cho phép NULL để vẫn ghi được vết tấn công.
-- ---------------------------------------------------------------------
SET @cho_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff_activity_logs'
                    AND COLUMN_NAME='staff_id');
SET @sql := IF(@cho_null = 'NO',
  'ALTER TABLE staff_activity_logs MODIFY COLUMN staff_id INT NULL',
  'SELECT ''Cot staff_id da cho phep NULL'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Thêm cột ghi tên tài khoản bị thử — biết kẻ tấn công nhắm vào ai
SET @co := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff_activity_logs'
              AND COLUMN_NAME='attempted_username');
SET @sql := IF(@co=0,
  'ALTER TABLE staff_activity_logs ADD COLUMN attempted_username VARCHAR(50) NULL DEFAULT NULL',
  'SELECT ''Cot attempted_username da co'' AS ghi_chu');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- BƯỚC 3 — KHUNG NHÌN CẢNH BÁO TẤN CÔNG
--   Quản trị viên mở lên là thấy ngay IP nào đang dò mật khẩu.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS vw_login_canh_bao;
CREATE VIEW vw_login_canh_bao AS
SELECT
    ip_address                              AS dia_chi_ip,
    COUNT(*)                                AS so_lan_that_bai,
    COUNT(DISTINCT attempted_username)      AS so_tai_khoan_bi_thu,
    MIN(created_at)                         AS lan_dau,
    MAX(created_at)                         AS lan_cuoi
FROM staff_activity_logs
WHERE action = 'login_failed'
  AND created_at > NOW() - INTERVAL 24 HOUR
GROUP BY ip_address
HAVING COUNT(*) >= 5;


-- =====================================================================
-- KIỂM TRA KẾT QUẢ — phải thấy DAT ở cả bốn cột
-- =====================================================================
SELECT
  DATABASE() AS database_da_sua,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff'
               AND COLUMN_NAME='failed_attempts')=1 THEN 'DAT' ELSE 'THIEU' END AS dem_lan_sai,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff'
               AND COLUMN_NAME='locked_until')=1 THEN 'DAT' ELSE 'THIEU' END AS khoa_tam_thoi,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff'
               AND COLUMN_NAME='sessions_valid_from')=1 THEN 'DAT' ELSE 'THIEU' END AS thu_hoi_phien,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff_activity_logs'
               AND COLUMN_NAME='attempted_username')=1 THEN 'DAT' ELSE 'THIEU' END AS ghi_ten_bi_thu;

SELECT 'HOAN TAT - thay du DAT o tren la thanh cong' AS ket_luan;
