-- ============================================================================
-- NÂNG CẤP V14 — PHÂN LOẠI CẤP ĐỘ BẢO MẬT CHO Ý KIẾN
-- ============================================================================
--
-- Vì sao cần: không phải tin nào cũng nhạy cảm như nhau. Một phản ánh về ổ gà
-- ngoài đường khác hẳn một tố giác đường dây ma tuý có tên người trong cuộc.
-- Với dữ liệu của cơ quan công an, cần đánh dấu tin nhạy cảm để hạn chế người
-- xem chặt hơn và ghi nhật ký kỹ hơn — đây là bước đầu của "quản lý theo cấp
-- độ mật" mà quy định nhà nước yêu cầu.
--
-- Ba mức, đặt tên theo cách hành chính quen thuộc:
--   thuong        — tin thường, mọi cán bộ được phân công đều xem
--   can_bao_ve    — cần bảo vệ, chỉ người phụ trách + lãnh đạo
--   mat           — mật, chỉ lãnh đạo (admin/manager)
--
-- Mặc định 'thuong' để tin cũ và tin mới không khai báo vẫn chạy bình thường.
-- Việc siết quyền xem theo cấp độ làm ở tầng ứng dụng (route), không ở SQL,
-- để linh hoạt đổi chính sách mà không phải sửa cấu trúc bảng.
-- ============================================================================

ALTER TABLE submissions
  ADD COLUMN security_level ENUM('thuong', 'can_bao_ve', 'mat')
  NOT NULL DEFAULT 'thuong'
  COMMENT 'Cấp độ bảo mật: thuong/can_bao_ve/mat'
  AFTER urgency;

-- Đánh chỉ mục để lọc theo cấp độ nhanh (danh sách lọc "chỉ tin mật").
CREATE INDEX idx_submissions_security_level ON submissions (security_level);
