SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V28 — HÀNG SÀNG LỌC, NGOÀI THẨM QUYỀN, GHI CHÚ NỘI BỘ (ADR-003 việc 13–16)
-- ============================================================================
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (biến DB_NAME
-- trong server/.env).
USE hop_thu_an_ninh_so;

-- VÌ SAO:
-- Mọi tin CÓ DANH TÍNH vào hàng sàng lọc trước khi xử lý (trạng thái 'received'
-- — "chờ sàng lọc"). Người sàng lọc bấm một trong bốn nút: Xác nhận (sang
-- 'processing'), Chưa xác minh (ở lại hàng, gắn nhãn), Tin giả (vào thùng rác,
-- KHÔNG khoá máy, bắt ghi lý do), Ngoài thẩm quyền (cờ ngoai_tham_quyen — phần
-- chỉ lãnh đạo xem, có từ v26). Tin ẩn danh vẫn qua hàng kiểm duyệt ẩn danh.
--
-- Bản này thêm:
--   1. submissions.chua_xac_minh_luc  — lúc bấm "Chưa xác minh" (NULL = chưa bấm)
--   2. submissions.sang_loc_boi / sang_loc_luc — ai sàng lọc, lúc nào
--   3. submissions.giu_cho_lanh_dao — tin TỐ GIÁC bị đánh "Tin giả" không tự
--      xoá sau 7 ngày trong thùng rác; giữ tới khi lãnh đạo xem qua (lãnh đạo
--      khôi phục hoặc xoá tay). Tránh mất một tố giác thật vì một lần bấm.
--   4. Bảng ghi_chu_noi_bo — ghi chú của cán bộ trên hồ sơ. Người dân tra cứu
--      không thấy. CHỈ GHI THÊM: không sửa, không xoá ghi chú (trigger), để
--      giữ đúng diễn biến xử lý. Ghi chú đi theo hồ sơ: hồ sơ bị xoá vĩnh viễn
--      thì ghi chú đi theo (khoá ngoại CASCADE — MySQL không chạy trigger cho
--      thao tác dây chuyền, nên trigger không chặn việc này).
--   5. Tin ẩn danh đã duyệt đang ở 'received' chuyển sang 'processing': từ bản
--      này 'received' nghĩa là "chờ sàng lọc", chỉ dành cho tin có danh tính;
--      duyệt tin ẩn danh đưa thẳng vào 'processing'.
--
-- THỜI ĐIỂM: dừng máy chủ -> chạy tệp này -> cập nhật mã -> khởi động lại.
-- Mã mới chạy khi chưa có cột thì các nút sàng lọc báo "chạy nang_cap_v28.sql"
-- (503), không làm gì nửa vời.
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- CHẠY: HeidiSQL (đăng nhập root — bước 4 tạo trigger) -> chọn đúng database
--       -> dán toàn bộ -> F9
-- ============================================================================


-- 1–3. Cột trên submissions
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN chua_xac_minh_luc DATETIME NULL DEFAULT NULL COMMENT ''Lúc sàng lọc bấm Chưa xác minh (ADR-003)''',
    'SELECT ''cột chua_xac_minh_luc đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'chua_xac_minh_luc'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN sang_loc_boi INT NULL DEFAULT NULL COMMENT ''Cán bộ sàng lọc (ADR-003)''',
    'SELECT ''cột sang_loc_boi đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'sang_loc_boi'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN sang_loc_luc DATETIME NULL DEFAULT NULL COMMENT ''Lúc sàng lọc (ADR-003)''',
    'SELECT ''cột sang_loc_luc đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'sang_loc_luc'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN giu_cho_lanh_dao TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Không tự xoá khỏi thùng rác, chờ lãnh đạo xem (ADR-003)''',
    'SELECT ''cột giu_cho_lanh_dao đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'giu_cho_lanh_dao'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 4. Ghi chú nội bộ — chỉ ghi thêm
CREATE TABLE IF NOT EXISTS ghi_chu_noi_bo (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT NOT NULL,
  staff_id INT NOT NULL,
  noi_dung TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ghi_chu_ho_so (submission_id, created_at),
  CONSTRAINT fk_ghi_chu_ho_so FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ghi_chu_can_bo FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_ghi_chu_khong_sua;
CREATE TRIGGER trg_ghi_chu_khong_sua BEFORE UPDATE ON ghi_chu_noi_bo
  FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Ghi chu noi bo chi ghi them: khong duoc sua (ADR-003)';

DROP TRIGGER IF EXISTS trg_ghi_chu_khong_xoa;
CREATE TRIGGER trg_ghi_chu_khong_xoa BEFORE DELETE ON ghi_chu_noi_bo
  FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Ghi chu noi bo chi ghi them: khong duoc xoa (ADR-003)';


-- 5. Tin ẩn danh đã duyệt: 'received' -> 'processing' (ghi lịch sử như thủ tục)
INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by)
SELECT id, 'received', 'processing', 'Nâng cấp v28: tin ẩn danh đã duyệt chuyển vào xử lý', NULL
  FROM submissions
 WHERE status = 'received' AND is_anonymous = 1 AND deleted_at IS NULL;

UPDATE submissions SET status = 'processing'
 WHERE status = 'received' AND is_anonymous = 1 AND deleted_at IS NULL;


-- 6. Kiểm tra
SELECT COUNT(*) AS so_tin_cho_sang_loc
  FROM submissions
 WHERE status = 'received' AND is_anonymous = 0 AND deleted_at IS NULL
   AND to_giac_mat = 0 AND ngoai_tham_quyen = 0;

SELECT TRIGGER_NAME, EVENT_MANIPULATION
  FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'ghi_chu_noi_bo';
