SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V30 — CẢNH BÁO SỐ ĐƠN ĐỘT BIẾN THEO ĐỊA BÀN (ADR-003 việc 25)
-- ============================================================================
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (biến DB_NAME
-- trong server/.env).
USE hop_thu_an_ninh_so;

-- VÌ SAO:
-- Số tin của một địa bàn trong 30 phút vượt hẳn mức thường thì báo cán bộ xem.
-- Đột biến có thể là phá hoại, cũng có thể là sự việc thật nhiều người cùng báo
-- (cháy, ẩu đả lớn) — nên CHỈ CẢNH BÁO, không tự chặn (server/src/lib/dot-bien.js).
--
-- Mỗi địa bàn tối đa MỘT cảnh báo cho mỗi khung 30 phút: khoá duy nhất
-- (ward_id, khung) — nhiều tin đến cùng lúc thì CSDL chỉ cho một câu ghi cảnh
-- báo thành công, không ra hàng loạt cảnh báo trùng.
--
-- THỜI ĐIỂM: chạy lúc nào cũng được. Chưa có bảng thì máy chủ bỏ qua bước cảnh
-- báo, không ảnh hưởng việc nhận tin. Chạy lại nhiều lần không báo lỗi.
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- ============================================================================

CREATE TABLE IF NOT EXISTS canh_bao_dot_bien (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  ward_id INT NOT NULL,
  khung BIGINT NOT NULL COMMENT 'Số thứ tự khung 30 phút (thời điểm / 30 phút) — chống trùng',
  so_tin INT NOT NULL,
  nguong INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dot_bien_khung (ward_id, khung),
  INDEX idx_dot_bien_luc (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT COUNT(*) AS so_canh_bao FROM canh_bao_dot_bien;
