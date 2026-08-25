-- ============================================================================
-- NÂNG CẤP V15 — ĐẾM LƯỢT XEM TIN
-- ============================================================================
--
-- Vì sao cần: để biết bà con quan tâm tin nào, và làm khu "Bà con đang quan
-- tâm" — tin nhiều người đọc thì càng nhiều người đọc, tạo hiệu ứng lan truyền
-- có lợi cho tuyên truyền.
--
-- GHI CHÚ: cơ chế GHIM TIN đã có sẵn từ nang_cap_v13.sql qua cột `is_featured`
-- (máy chủ đã sắp xếp tin nổi bật lên đầu). Không thêm cột ghim mới nữa để
-- tránh hai cột cùng chức năng gây rối. Muốn ghim tin nào thì dùng
-- `database/doi_tin_noi_bat.sql`.
-- ============================================================================

ALTER TABLE news
  ADD COLUMN view_count INT NOT NULL DEFAULT 0
  COMMENT 'Số lượt xem, phục vụ khu Bà con đang quan tâm'
  AFTER is_published;

CREATE INDEX idx_news_views ON news (view_count);
