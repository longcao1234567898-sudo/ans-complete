SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V26 — BỎ BA CẤP ĐỘ BẢO MẬT, THAY BẰNG HAI CỜ (ADR-003 §4)
-- ============================================================================
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (biến DB_NAME
-- trong server/.env).
USE hop_thu_an_ninh_so;

-- VÌ SAO:
-- Người vận hành bỏ ba mức Thường / Cần bảo vệ / Mật (ADR-003). Thay bằng hai cờ
-- trên mỗi hồ sơ; máy chủ đọc cả hai qua MỘT chỗ (server/src/lib/pham-vi-ho-so.js):
--   to_giac_mat       tin tố cáo cán bộ, người làm việc trong cơ quan nhà nước,
--                     chính quyền — CHỈ LÃNH ĐẠO xem
--   ngoai_tham_quyen  tin sàng lọc đánh dấu ngoài thẩm quyền — CHỈ LÃNH ĐẠO xem
-- Cán bộ (handler) không thấy hồ sơ mang cờ nào, kể cả khi đang được giao.
--
-- CHUYỂN DỮ LIỆU CŨ — không hồ sơ nào đang được che bị lộ ra cho cán bộ:
-- mọi hồ sơ KHÔNG ở mức 'thuong' (gồm 'can_bao_ve', 'mat', NULL, chuỗi rỗng ''
-- mà MySQL không nghiêm ngặt lưu thay cho giá trị ENUM lạ) chuyển thành
-- to_giac_mat = 1. Cột security_level GIỮ NGUYÊN, không xoá, để còn đối chiếu
-- hoặc quay lại; mã máy chủ mới không đọc cột đó nữa.
--
-- HỆ QUẢ CẦN BIẾT: cán bộ đang được giao một hồ sơ mức Cần bảo vệ sẽ không còn
-- mở được hồ sơ đó (ADR-003, bảng rủi ro). Bước 3 in danh sách để lãnh đạo xử
-- lý hoặc giao lại cho lãnh đạo. LƯU LẠI kết quả bước 3.
--
-- THỜI ĐIỂM: dừng máy chủ -> chạy tệp này -> cập nhật mã -> khởi động lại.
-- Mã mới chạy trước khi có cột thì cán bộ không thấy hồ sơ nào (cố ý, an toàn);
-- mã cũ chạy sau khi có cột thì không đọc cờ — đừng để khoảng này kéo dài.
--
-- NÊN SAO LƯU TRƯỚC KHI CHẠY. Bước 2 không đảo ngược được (ngoài bằng bản sao lưu).
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- ============================================================================


-- 1. Hai cột cờ
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN to_giac_mat TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Tin tố cáo cán bộ/người nhà nước — chỉ lãnh đạo xem (ADR-003)''',
    'SELECT ''cột to_giac_mat đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'to_giac_mat'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN ngoai_tham_quyen TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''Tin ngoài thẩm quyền — chỉ lãnh đạo xem (ADR-003)''',
    'SELECT ''cột ngoai_tham_quyen đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'ngoai_tham_quyen'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX idx_submissions_co_lanh_dao ON submissions (to_giac_mat, ngoai_tham_quyen)',
    'SELECT ''chỉ mục idx_submissions_co_lanh_dao đã có, bỏ qua''')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND index_name = 'idx_submissions_co_lanh_dao'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 2. Chuyển mức cũ sang cờ (chỉ khi CSDL có cột security_level — đã chạy v14)
SET @sql = (
  SELECT IF(COUNT(*) = 1,
    'UPDATE submissions SET to_giac_mat = 1 WHERE (security_level IS NULL OR security_level <> ''thuong'') AND to_giac_mat = 0',
    'SELECT ''không có cột security_level (chưa chạy v14), không có gì để chuyển''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'security_level'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- 3. Hồ sơ mang cờ đang giao cho CÁN BỘ — LƯU LẠI kết quả này (xuất CSV).
--    Người này không còn mở được hồ sơ; lãnh đạo xử lý hoặc giao lại cho lãnh đạo.
SELECT s.id, s.tracking_code, s.assigned_to, st.full_name AS nguoi_dang_duoc_giao
  FROM submissions s
  JOIN staff st ON st.id = s.assigned_to
 WHERE (s.to_giac_mat = 1 OR s.ngoai_tham_quyen = 1)
   AND st.role NOT IN ('admin', 'manager');

-- Kiểm lại: phải thấy hai cột
SELECT column_name, column_type, column_default
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'submissions'
   AND column_name IN ('to_giac_mat', 'ngoai_tham_quyen');
