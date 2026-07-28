-- =====================================================================
-- NÂNG CẤP V8 — QUYỀN XOÁ DỮ LIỆU CÁ NHÂN
--
-- CĂN CỨ: Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân
--
-- ĐẶC ĐIỂM BẢN NÀY:
--   - Chạy lại nhiều lần không báo lỗi
--   - KHÔNG ghi cứng tên database -> chạy đúng trên database đang chọn
--   - Có bước tự kiểm tra ở đầu và cuối
--
-- ⚠️ TRƯỚC KHI CHẠY, PHẢI CHỌN ĐÚNG DATABASE:
--   Trong HeidiSQL, bấm vào tên database ở cột bên TRÁI cho nó sáng lên.
--   Database đó phải là database mà BACKEND đang kết nối —
--   xem biến DB_NAME trong phần Environment trên Render.
--   Chạy nhầm database là cột được thêm vào chỗ backend không dùng tới.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BƯỚC 0 — KIỂM TRA ĐANG Ở ĐÚNG DATABASE CHƯA
--          Nhìn kết quả bảng này TRƯỚC KHI đọc tiếp.
-- ---------------------------------------------------------------------
SELECT
  DATABASE() AS dang_sua_database,
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'submissions') AS co_bang_submissions,
  CASE
    WHEN DATABASE() IS NULL
      THEN 'CHUA CHON DATABASE - bam vao ten database o cot trai'
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='submissions') = 0
      THEN 'SAI DATABASE - o day khong co bang submissions'
    ELSE 'DUNG DATABASE - chay tiep duoc'
  END AS ket_luan;


-- ---------------------------------------------------------------------
-- BƯỚC 1 — HAI CỘT ĐÁNH DẤU ĐÃ XOÁ DANH TÍNH
--
--   MySQL 8 không hỗ trợ "ADD COLUMN IF NOT EXISTS" nên phải tự kiểm tra.
--   Dùng DATABASE() thay vì ghi cứng tên -> chạy đúng ở mọi database.
-- ---------------------------------------------------------------------

-- 1.1. Cột identity_erased
SET @co_cot := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'submissions'
    AND COLUMN_NAME  = 'identity_erased'
);
SET @lenh := IF(@co_cot = 0,
  'ALTER TABLE submissions ADD COLUMN identity_erased BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT ''Cot identity_erased da co - bo qua'' AS ghi_chu'
);
PREPARE st FROM @lenh; EXECUTE st; DEALLOCATE PREPARE st;

-- 1.2. Cột identity_erased_at
SET @co_cot := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'submissions'
    AND COLUMN_NAME  = 'identity_erased_at'
);
SET @lenh := IF(@co_cot = 0,
  'ALTER TABLE submissions ADD COLUMN identity_erased_at DATETIME NULL DEFAULT NULL',
  'SELECT ''Cot identity_erased_at da co - bo qua'' AS ghi_chu'
);
PREPARE st FROM @lenh; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- BƯỚC 2 — BẢNG LƯU YÊU CẦU XOÁ
--
--   Bảng này là BẰNG CHỨNG TUÂN THỦ: chứng minh đơn vị có tiếp nhận và
--   xử lý yêu cầu của công dân theo Nghị định 13.
--
--   ⚠️ TÊN CỘT PHẢI KHỚP MÃ NGUỒN: requester_ip, handled_at, handled_by, reason
-- ---------------------------------------------------------------------

-- 2.1. Bảng tồn tại nhưng THIẾU cột requester_ip -> được tạo bằng bản SQL cũ
--      có tên cột sai. Bảng đó chắc chắn RỖNG (mọi lệnh ghi đều thất bại),
--      nên xoá đi tạo lại là an toàn.
SET @bang_sai := (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'data_deletion_requests')
     AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'data_deletion_requests'
                       AND COLUMN_NAME = 'requester_ip')
    THEN 1 ELSE 0 END
);
SET @lenh := IF(@bang_sai = 1,
  'DROP TABLE data_deletion_requests',
  'SELECT ''Bang chua co hoac da dung - bo qua'' AS ghi_chu'
);
PREPARE st FROM @lenh; EXECUTE st; DEALLOCATE PREPARE st;

-- 2.2. Tạo bảng với ĐÚNG tên cột mà mã nguồn sử dụng
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    submission_id   BIGINT UNSIGNED NOT NULL,
    tracking_code   CHAR(6) NOT NULL,

    -- pending  = dang cho (ho so chua dong)
    -- done     = da xoa danh tinh xong
    -- rejected = tu choi (hiem, phai ghi ro ly do)
    status          ENUM('pending','done','rejected') NOT NULL DEFAULT 'pending',

    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    handled_at      DATETIME NULL DEFAULT NULL,
    handled_by      INT NULL DEFAULT NULL,
    reason          VARCHAR(255) NULL DEFAULT NULL,
    requester_ip    VARCHAR(45) NULL DEFAULT NULL,

    INDEX idx_submission (submission_id),
    INDEX idx_status (status, requested_at),
    INDEX idx_tracking (tracking_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- BƯỚC 3 — KHUNG NHÌN: YÊU CẦU ĐANG CHỜ
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS vw_deletion_pending;
CREATE VIEW vw_deletion_pending AS
SELECT
    d.id,
    d.tracking_code,
    d.requested_at,
    DATEDIFF(NOW(), d.requested_at) AS so_ngay_cho,
    s.status        AS trang_thai_ho_so,
    c.name          AS nhom_xu_ly,
    s.deadline_at   AS han_xu_ly
FROM data_deletion_requests d
JOIN submissions s ON s.id = d.submission_id
LEFT JOIN categories c ON c.id = s.category_id
WHERE d.status = 'pending';


-- =====================================================================
-- KIỂM TRA KẾT QUẢ CUỐI — phải thấy "DAT" ở cả ba dòng
-- =====================================================================
SELECT
  DATABASE() AS database_da_sua,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
               AND COLUMN_NAME='identity_erased') = 1
       THEN 'DAT' ELSE 'THIEU' END AS cot_identity_erased,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='submissions'
               AND COLUMN_NAME='identity_erased_at') = 1
       THEN 'DAT' ELSE 'THIEU' END AS cot_identity_erased_at,
  CASE WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='data_deletion_requests'
               AND COLUMN_NAME='requester_ip') = 1
       THEN 'DAT' ELSE 'THIEU' END AS bang_yeu_cau_xoa;
