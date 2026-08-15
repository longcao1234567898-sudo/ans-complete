-- ============================================================================
-- NÂNG CẤP v13 — CHỌN TIN NỔI BẬT BẰNG SQL
-- ============================================================================
--
-- CÁCH DÙNG: HeidiSQL -> bấm chọn database -> dán file này -> F9
-- Không cần đẩy mã nguồn, không cần khởi động lại máy chủ.
--
-- VÌ SAO CẦN:
-- Trước đây tin nổi bật LUÔN là bài mới nhất — hệ thống tự lấy bài đầu danh
-- sách. Đơn vị muốn đẩy một bài quan trọng lên đầu (ví dụ cảnh báo lừa đảo
-- đang rộ) thì không có cách nào ngoài sửa mã nguồn rồi dựng lại web.
--
-- Nay chỉ cần một câu lệnh SQL. Đúng tinh thần các phần khác của hệ thống:
-- việc thuộc về NỘI DUNG thì cán bộ tự làm được, không phải gọi lập trình viên.
-- ============================================================================

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE news ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = tin nổi bật, hiện to ở đầu trang''',
    'SELECT ''cột is_featured đã có, bỏ qua'''
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'news' AND column_name = 'is_featured'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Chỉ mục cho việc sắp xếp (tin nổi bật lên đầu, rồi tới bài mới nhất)
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE news ADD INDEX idx_noi_bat (is_featured, published_at)',
    'SELECT ''chỉ mục idx_noi_bat đã có, bỏ qua'''
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'news' AND index_name = 'idx_noi_bat'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- CÁCH ĐỔI TIN NỔI BẬT — DÙNG HÀNG NGÀY
-- ============================================================================
--
-- BƯỚC 1: xem danh sách để lấy id bài muốn đẩy lên
--
--     SELECT id, LEFT(title, 60) AS tieu_de, category, published_at, is_featured
--       FROM news
--      WHERE is_published = TRUE
--      ORDER BY published_at DESC
--      LIMIT 20;
--
-- BƯỚC 2: đặt bài đó làm tin nổi bật (thay 12 bằng id thật)
--
--     UPDATE news SET is_featured = 0;          -- bỏ tin nổi bật cũ
--     UPDATE news SET is_featured = 1 WHERE id = 12;
--
--     ⚠️ PHẢI chạy CẢ HAI dòng, theo đúng thứ tự. Bỏ dòng đầu thì có hai tin
--        cùng đánh dấu nổi bật, hệ thống lấy bài mới hơn — không như ý.
--
-- BƯỚC 3: mở lại trang Tin tức, bài đó đã nằm ở khối lớn trên cùng.
--         Không cần khởi động lại máy chủ.
--
-- ĐỂ QUAY VỀ TỰ ĐỘNG (lấy bài mới nhất làm tin nổi bật):
--
--     UPDATE news SET is_featured = 0;
--
-- ============================================================================

-- Kiểm tra sau khi chạy
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'news'
      AND column_name = 'is_featured')                      AS cot_moi,
  (SELECT COUNT(*) FROM news WHERE is_featured = 1)         AS dang_noi_bat;
-- Mong đợi: cot_moi = 1 · dang_noi_bat = 0 (chưa chọn bài nào)
