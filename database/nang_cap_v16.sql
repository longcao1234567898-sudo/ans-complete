-- ============================================================================
-- NÂNG CẤP V16 — TOẠ ĐỘ VỊ TRÍ VỤ VIỆC
-- ============================================================================
--
-- Vì sao cần: bà con mô tả địa điểm bằng lời thường không đủ rõ ("gần cây xăng",
-- "đầu ấp"), cán bộ xuống hiện trường phải dò hỏi. Nút gửi vị trí cho phép bà
-- con chia sẻ toạ độ chính xác nơi xảy ra vụ việc.
--
-- ⚠️ TOẠ ĐỘ NÀY LÀ TỰ NGUYỆN. Người dân phải chủ động bấm nút và cho phép trình
--    duyệt lấy vị trí. Không bấm thì hai cột này để trống, ý kiến vẫn gửi bình
--    thường. Hệ thống KHÔNG tự lấy vị trí lén.
--
-- ⚠️ ĐÂY LÀ VỊ TRÍ VỤ VIỆC, KHÔNG PHẢI VỊ TRÍ NGƯỜI BÁO. Bà con nên bấm nút khi
--    đang ĐỨNG TẠI nơi xảy ra sự việc. Giao diện có nhắc điều này.
--
-- Kiểu DECIMAL(10,7) đủ độ chính xác khoảng 1cm — thừa cho nhu cầu, nhưng dùng
-- DECIMAL thay vì FLOAT để không sai số khi tính toán về sau.
-- ============================================================================

ALTER TABLE submissions
  ADD COLUMN incident_lat DECIMAL(10, 7) NULL
  COMMENT 'Vĩ độ nơi xảy ra vụ việc, do người dân tự nguyện gửi'
  AFTER ward_id;

ALTER TABLE submissions
  ADD COLUMN incident_lng DECIMAL(10, 7) NULL
  COMMENT 'Kinh độ nơi xảy ra vụ việc, do người dân tự nguyện gửi'
  AFTER incident_lat;

-- Chỉ mục để lọc nhanh những tin CÓ toạ độ khi vẽ bản đồ điểm nóng.
CREATE INDEX idx_submissions_toa_do ON submissions (incident_lat, incident_lng);
