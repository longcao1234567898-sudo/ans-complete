-- =====================================================================
-- NÂNG CẤP V8 — QUYỀN XOÁ DỮ LIỆU CÁ NHÂN
-- (BẢN AN TOÀN — CHẠY LẠI NHIỀU LẦN KHÔNG BÁO LỖI)
--
-- CĂN CỨ: Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân
--   Chủ thể dữ liệu có quyền yêu cầu xoá dữ liệu của mình, nhưng quyền
--   này KHÔNG tuyệt đối — bị hạn chế khi dữ liệu còn cần cho nghĩa vụ
--   pháp lý hoặc hoạt động điều tra.
--
-- THIẾT KẾ THEO NGUYÊN TẮC ĐÓ:
--   - Hồ sơ ĐÃ ĐÓNG      -> xoá danh tính NGAY
--   - Hồ sơ ĐANG XỬ LÝ   -> ghi nhận yêu cầu, xoá khi đóng hồ sơ
--
-- "XOÁ" ở đây là ẨN DANH HOÁ, không xoá cả bản ghi:
--   Xoá : họ tên, số điện thoại, email, địa chỉ IP, thông tin trình duyệt
--   GIỮ : nội dung ý kiến, nhóm, trạng thái, kết quả xử lý
--   Vì sau khi bóc tách danh tính, phần còn lại là hồ sơ nghiệp vụ và
--   số liệu thống kê của đơn vị, không còn là dữ liệu cá nhân.
--
-- CÁCH CHẠY:
--   HeidiSQL -> chọn database hop_thu_an_ninh_so -> Load SQL file -> F9
--   Chạy bao nhiêu lần cũng được, không hỏng dữ liệu, không báo lỗi.
-- =====================================================================
USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------------
-- 1. HAI CỘT ĐÁNH DẤU ĐÃ XOÁ DANH TÍNH
--
--    MySQL 8 KHÔNG hỗ trợ "ADD COLUMN IF NOT EXISTS" (đó là cú pháp của
--    MariaDB). Nên phải tự kiểm tra: cột đã có thì bỏ qua, chưa có thì thêm.
--    Nhờ vậy chạy lại file này không còn báo lỗi 1060 Duplicate column.
-- ---------------------------------------------------------------------

-- 1.1. Cột identity_erased
SET @co_cot := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
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
  WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
    AND TABLE_NAME   = 'submissions'
    AND COLUMN_NAME  = 'identity_erased_at'
);
SET @lenh := IF(@co_cot = 0,
  'ALTER TABLE submissions ADD COLUMN identity_erased_at DATETIME NULL DEFAULT NULL',
  'SELECT ''Cot identity_erased_at da co - bo qua'' AS ghi_chu'
);
PREPARE st FROM @lenh; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- 2. BẢNG LƯU YÊU CẦU XOÁ
--
--    Bảng này là BẰNG CHỨNG TUÂN THỦ: chứng minh đơn vị có tiếp nhận và
--    xử lý yêu cầu của công dân theo đúng Nghị định 13.
--    Khi cần, đơn vị xuất được danh sách: nhận bao nhiêu yêu cầu, xử lý
--    thế nào, trong bao lâu.
--
--    CREATE TABLE IF NOT EXISTS -> chạy lại không báo lỗi.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    submission_id   BIGINT UNSIGNED NOT NULL,
    tracking_code   CHAR(6) NOT NULL,

    -- pending  = dang cho (ho so chua dong)
    -- done     = da xoa danh tinh xong
    -- rejected = tu choi (hiem, phai ghi ro ly do)
    status          ENUM('pending','done','rejected') NOT NULL DEFAULT 'pending',

    requested_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at    DATETIME NULL DEFAULT NULL,
    processed_by    INT NULL DEFAULT NULL,
    note            VARCHAR(255) NULL DEFAULT NULL,
    request_ip      VARCHAR(45) NULL DEFAULT NULL,

    INDEX idx_submission (submission_id),
    INDEX idx_status (status, requested_at),
    INDEX idx_tracking (tracking_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 3. KHUNG NHÌN: YÊU CẦU ĐANG CHỜ
--    Cán bộ mở lên là thấy ngay yêu cầu nào chờ lâu nhất.
--    DROP rồi CREATE -> chạy lại được nhiều lần.
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
-- KIỂM TRA KẾT QUẢ — phải thấy đủ 3 bảng dưới đây
-- =====================================================================
SELECT '1. Hai cot moi trong bang submissions' AS buoc;
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
  AND TABLE_NAME   = 'submissions'
  AND COLUMN_NAME IN ('identity_erased', 'identity_erased_at');

SELECT '2. Bang luu yeu cau xoa' AS buoc;
SELECT COUNT(*) AS so_yeu_cau_hien_co FROM data_deletion_requests;

SELECT '3. Khung nhin yeu cau dang cho' AS buoc;
SELECT COUNT(*) AS so_yeu_cau_dang_cho FROM vw_deletion_pending;

SELECT 'HOAN TAT - thay du 3 bang ket qua o tren la thanh cong' AS ket_luan;
