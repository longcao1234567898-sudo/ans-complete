-- =====================================================================
-- NÂNG CẤP V3 — Hộp Thư An Ninh Số
-- Thêm: XÁC THỰC OTP qua email · Chuyển ảnh sang CLOUDINARY
--
-- CÁCH CHẠY: HeidiSQL -> chọn database hop_thu_an_ninh_so
--            -> File -> Load SQL file -> chọn file này -> F9
--
-- AN TOÀN: KHÔNG mất dữ liệu. Chỉ thêm 1 bảng và vài cột.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- 1) BẢNG MÃ OTP — xác thực email công dân trước khi gửi ý kiến
--    Bảo mật: KHÔNG lưu email thật (chỉ băm), KHÔNG lưu mã thật (chỉ băm)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    email_hash   CHAR(64) NOT NULL      COMMENT 'SHA-256 của email',
    code_hash    VARCHAR(255) NOT NULL  COMMENT 'Mã OTP đã băm bcrypt',

    attempts     INT DEFAULT 0          COMMENT 'Nhập sai quá 5 lần thì huỷ mã',
    is_used      BOOLEAN DEFAULT FALSE,

    expires_at   DATETIME NOT NULL      COMMENT 'Hết hạn sau 10 phút',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address   VARCHAR(45),

    INDEX idx_email_hash (email_hash, is_used, expires_at),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 2) SUBMISSIONS — đánh dấu ý kiến đã xác thực OTP
-- ---------------------------------------------------------------
ALTER TABLE submissions
    ADD COLUMN is_verified_otp BOOLEAN DEFAULT FALSE
    COMMENT 'Người gửi đã xác thực email qua OTP';

-- ---------------------------------------------------------------
-- 3) ẢNH — chuyển sang lưu ĐƯỜNG LINK Cloudinary thay vì base64
--    (LONGTEXT vẫn giữ để tương thích ảnh cũ đã lưu base64)
-- ---------------------------------------------------------------
ALTER TABLE submission_images
    ADD COLUMN cloudinary_id VARCHAR(255) NULL
    COMMENT 'ID ảnh trên Cloudinary — dùng để xoá ảnh khi cần';

ALTER TABLE submission_images
    ADD COLUMN storage ENUM('base64','cloudinary') DEFAULT 'base64'
    COMMENT 'Ảnh đang lưu ở đâu';

-- Đánh dấu ảnh cũ (base64) để phân biệt
UPDATE submission_images SET storage = 'base64' WHERE storage IS NULL;

-- ---------------------------------------------------------------
-- 4) Dọn mã OTP hết hạn (chạy định kỳ khi cần)
-- ---------------------------------------------------------------
-- DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL 1 DAY;

-- ---------------------------------------------------------------
-- KIỂM TRA — chạy xong phải ra kết quả
-- ---------------------------------------------------------------
SELECT 'otp_codes' AS bang, COUNT(*) AS so_dong FROM otp_codes;

SELECT COLUMN_NAME AS cot_moi_trong_submissions
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
  AND TABLE_NAME = 'submissions' AND COLUMN_NAME = 'is_verified_otp';

SELECT COLUMN_NAME AS cot_moi_trong_submission_images
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
  AND TABLE_NAME = 'submission_images'
  AND COLUMN_NAME IN ('cloudinary_id', 'storage');
