SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V37 — ĐẾM LẦN THỬ MÃ PIN PHÒNG TRAO ĐỔI THEO HỒ SƠ (BUG-040)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO: giới hạn thử PIN cũ chỉ tính theo IP — thuê nhiều IP là dò tiếp được
-- trên cùng một hồ sơ. Bảng này đếm theo HỒ SƠ: 10 lần sai trong 24 giờ thì tạm
-- khoá mở phòng của hồ sơ đó (server/src/lib/khoa-mo-phong.js).
--
-- ⚠️ BẮT BUỘC chạy trước khi cập nhật mã máy chủ: thiếu bảng thì máy chủ KHÔNG
-- mở phòng trao đổi cho ai (cố ý — không đếm được lần thử thì không cho thử).
-- Tra cứu tiến độ và gửi ý kiến không bị ảnh hưởng.
--
-- Không lưu IP, không lưu PIN đã thử — chỉ số lần và mốc bắt đầu đếm.
-- Chạy lại nhiều lần không sao (IF NOT EXISTS).
-- QUYỀN: cần quyền CREATE — chạy bằng tài khoản quản trị CSDL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS khoa_mo_phong (
  submission_id BIGINT   NOT NULL PRIMARY KEY COMMENT 'Hồ sơ bị thử PIN',
  so_lan        INT      NOT NULL DEFAULT 0  COMMENT 'Số lượt thử SAI trong cửa sổ hiện tại (lượt đúng được trả lại)',
  dem_tu        DATETIME NOT NULL             COMMENT 'Bắt đầu cửa sổ 24 giờ',
  CONSTRAINT fk_khoa_mo_phong_submission FOREIGN KEY (submission_id)
    REFERENCES submissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='BUG-040: chống dò mã PIN phòng trao đổi theo hồ sơ';
