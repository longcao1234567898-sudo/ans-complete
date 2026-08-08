-- =====================================================================
-- NÂNG CẤP V10 — MÃ QR ĐỊNH VỊ (dán tại hiện trường / quầy tiếp dân)
--
-- VÌ SAO CẦN: khâu yếu nhất của tin báo hiện nay là ĐỊA ĐIỂM. Bà con mô tả
-- "gần nhà ông A", "chỗ cây me đầu ấp" — cán bộ đọc xong vẫn không biết
-- thuộc địa bàn nào, phải gọi lại hỏi, mà tin ẩn danh thì không gọi được.
--
-- CÁCH XỬ LÝ: in mã QR dán sẵn tại từng điểm (đầu ấp, chợ, quầy tiếp dân).
-- Bà con quét mã -> mở thẳng form gửi ý kiến kèm ?diem=MÃ -> hệ thống tự
-- điền địa bàn. Không phải gõ, không nhớ sai, không cần hỏi lại.
--
-- MÃ LÀ CÔNG KHAI, in trên giấy dán nơi công cộng, nên đường dẫn tra mã
-- (GET /api/submissions/qr-points/:code) KHÔNG yêu cầu đăng nhập.
-- Mã chỉ dùng để GỢI Ý địa bàn — không cấp thêm quyền gì cho người quét.
--
-- CHẠY: HeidiSQL -> chọn ĐÚNG database backend đang dùng -> F9
--       (xem /api/health/schema để biết database nào)
--       Chạy lại nhiều lần không báo lỗi.
--
-- YÊU CẦU TRƯỚC: đã chạy nang_cap_v2.sql (tạo bảng wards).
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
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='wards') = 0
      THEN 'THIEU BANG wards - hay chay nang_cap_v2.sql truoc'
    ELSE 'DUNG DATABASE - chay tiep duoc'
  END AS ket_luan;


-- ---------------------------------------------------------------------
-- BƯỚC 1 — BẢNG ĐIỂM QR
--
--   code: 8 ký tự do máy chủ sinh ngẫu nhiên (generateTrackingCode(8)),
--         dùng chung bộ ký tự đã bỏ các chữ dễ đọc nhầm (0/O, 1/I).
--         Backend so khớp sau khi .toUpperCase() nên đối chiếu không phân
--         biệt hoa thường — collation utf8mb4_unicode_ci cũng vậy.
--
--   is_active: gỡ tấm dán ngoài hiện trường thì TẮT ở đây, đừng xoá.
--         Xoá hẳn sẽ làm các tin báo cũ mất dấu vết nguồn gốc.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_points (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(8) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    ward_id INT NOT NULL,
    note VARCHAR(255) NULL DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NULL DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_code_active (code, is_active),
    INDEX idx_ward (ward_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- KIỂM TRA KẾT QUẢ — phải thấy DAT ở cả hai cột
-- =====================================================================
SELECT
  DATABASE() AS database_da_sua,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='qr_points')=1
       THEN 'DAT' ELSE 'THIEU' END AS bang_qr_points,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='qr_points'
               AND COLUMN_NAME='code')=1
       THEN 'DAT' ELSE 'THIEU' END AS cot_code;

SELECT 'HOAN TAT - vao /quan-tri/ma-qr de tao diem QR dau tien' AS ket_luan;
