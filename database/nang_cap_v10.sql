-- =====================================================================
-- NÂNG CẤP V10 — MÃ QR ĐỊNH VỊ (dán tại hiện trường / quầy tiếp dân)
--
-- Ý TƯỞNG: đơn vị dán mã QR tại các điểm cố định trên địa bàn (cột đèn,
-- cổng khu phố, bảng tin tổ dân phố...). Bà con quét mã, mở ra trang
-- "Gửi ý kiến" đã TỰ ĐỘNG CHỌN SẴN phường/xã của đúng điểm đó — khỏi
-- phải tự chọn, đỡ chọn nhầm địa bàn.
--
-- Bảng mới, không đụng tới bảng cũ:
--   qr_points  — danh sách điểm đã tạo mã, mỗi điểm gắn với 1 phường/xã
--
-- CHẠY: HeidiSQL -> chọn ĐÚNG database backend đang dùng -> F9
--       Chạy lại nhiều lần không báo lỗi.
-- =====================================================================

SELECT
  DATABASE() AS dang_sua_database,
  CASE
    WHEN DATABASE() IS NULL THEN 'CHUA CHON DATABASE'
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='wards') = 0
      THEN 'SAI DATABASE hoac CHUA CHAY nang_cap_v2.sql (thieu bang wards)'
    ELSE 'DUNG DATABASE - chay tiep duoc'
  END AS ket_luan;

CREATE TABLE IF NOT EXISTS qr_points (
    id INT PRIMARY KEY AUTO_INCREMENT,
    -- Mã ngắn nằm trong đường dẫn QR, vd: /gui-y-kien?diem=A3F9K2
    code CHAR(8) NOT NULL UNIQUE,
    -- Tên điểm để cán bộ nhận ra khi in, vd: "Cột đèn số 5 - hẻm 12"
    name VARCHAR(150) NOT NULL,
    ward_id INT NOT NULL,
    note VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_code (code),
    INDEX idx_ward (ward_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT
  DATABASE() AS database_da_sua,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='qr_points')=1
       THEN 'DAT' ELSE 'THIEU' END AS bang_qr_points;

SELECT 'HOAN TAT - thay DAT o tren la thanh cong' AS ket_luan;
