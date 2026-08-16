-- ============================================================================
-- ĐỔI TIN NỔI BẬT — CHO CẢ 4 LOẠI TIN
-- ============================================================================
--
-- Cần chạy nang_cap_v13.sql trước (tệp đó thêm cột is_featured).
--
-- CÁCH HOẠT ĐỘNG:
-- Máy chủ sắp xếp: is_featured lên trước, rồi mới tới bài mới nhất. Khi bà con
-- bấm lọc một chủ đề, máy chủ chỉ lấy bài của chủ đề đó — nên bài được đánh
-- dấu trong chủ đề ấy sẽ nổi lên đầu.
--
-- Nghĩa là: ĐÁNH DẤU ĐƯỢC MỘT BÀI CHO MỖI LOẠI, không phải chỉ một bài cho
-- cả trang. Vào "Tất cả" thì bài mới nhất trong số các bài được đánh dấu sẽ
-- đứng đầu.
--
-- BỐN LOẠI TIN — tên trong cột category:
--     an_ninh    -> Tin an ninh
--     canh_giac  -> Cảnh giác
--     thu_tuc    -> Hướng dẫn thủ tục
--     van_ban    -> Văn bản mới
-- ============================================================================


-- ---------------------------------------------------------------------------
-- BƯỚC 1 — XEM DANH SÁCH ĐỂ LẤY ID
--
-- Chạy riêng, nhìn kết quả rồi ghi lại id của bài muốn đẩy lên cho từng loại.
-- ---------------------------------------------------------------------------
SELECT category                     AS loai,
       id,
       LEFT(title, 55)              AS tieu_de,
       DATE(published_at)           AS ngay_dang,
       IF(is_featured = 1, '★ ĐANG NỔI BẬT', '') AS ghi_chu
  FROM news
 WHERE is_published = TRUE
 ORDER BY category, is_featured DESC, published_at DESC;


-- ---------------------------------------------------------------------------
-- BƯỚC 2 — ĐẶT TIN NỔI BẬT CHO TỪNG LOẠI
--
-- Mỗi loại làm HAI dòng, theo đúng thứ tự:
--   dòng đầu  — bỏ đánh dấu cũ TRONG LOẠI ĐÓ (không đụng các loại khác)
--   dòng sau  — đánh dấu bài mới
--
-- Thay số 12, 34, 56, 78 bằng id thật lấy từ bước 1.
-- Loại nào không muốn đổi thì bỏ qua cặp dòng của loại đó.
-- ---------------------------------------------------------------------------

-- ── Tin an ninh ────────────────────────────────────────────────────────────
UPDATE news SET is_featured = 0 WHERE category = 'an_ninh';
UPDATE news SET is_featured = 1 WHERE id = 12;

-- ── Cảnh giác ──────────────────────────────────────────────────────────────
UPDATE news SET is_featured = 0 WHERE category = 'canh_giac';
UPDATE news SET is_featured = 1 WHERE id = 34;

-- ── Hướng dẫn thủ tục ──────────────────────────────────────────────────────
UPDATE news SET is_featured = 0 WHERE category = 'thu_tuc';
UPDATE news SET is_featured = 1 WHERE id = 56;

-- ── Văn bản mới ────────────────────────────────────────────────────────────
UPDATE news SET is_featured = 0 WHERE category = 'van_ban';
UPDATE news SET is_featured = 1 WHERE id = 78;


-- ---------------------------------------------------------------------------
-- BƯỚC 3 — KIỂM TRA
--
-- Mỗi loại phải có ĐÚNG MỘT dòng. Loại nào ra 2 dòng trở lên là quên chạy
-- dòng "SET is_featured = 0" của loại đó — chạy lại cặp dòng ấy cho đúng.
-- ---------------------------------------------------------------------------
SELECT category AS loai, COUNT(*) AS so_bai_noi_bat,
       GROUP_CONCAT(id) AS cac_id
  FROM news
 WHERE is_featured = 1
 GROUP BY category;


-- ============================================================================
-- MẤY VIỆC HAY DÙNG
-- ============================================================================
--
-- Bỏ nổi bật ở MỘT loại (loại đó quay về lấy bài mới nhất):
--     UPDATE news SET is_featured = 0 WHERE category = 'canh_giac';
--
-- Bỏ nổi bật TOÀN BỘ (cả trang quay về cách cũ):
--     UPDATE news SET is_featured = 0;
--
-- Đánh dấu nhanh bài MỚI NHẤT của một loại:
--     UPDATE news SET is_featured = 0 WHERE category = 'canh_giac';
--     UPDATE news SET is_featured = 1
--       WHERE category = 'canh_giac' AND is_published = TRUE
--       ORDER BY published_at DESC LIMIT 1;
--
-- ⚠️ KHÔNG cần khởi động lại máy chủ. Mở lại trang Tin tức là thấy ngay.
-- ============================================================================

-- ============================================================================
-- CHỌN RIÊNG TIN NỔI BẬT CHO MỤC "TẤT CẢ"
-- ============================================================================
--
-- VẤN ĐỀ: đánh dấu bốn bài cho bốn loại rồi, nhưng vào mục "Tất cả" thì bài
-- nào lên đầu? Hệ thống lấy bài MỚI NHẤT trong bốn bài đó — có khi không phải
-- bài đơn vị muốn đưa lên trang chủ.
--
-- CÁCH GIẢI: cột is_featured nhận HAI mức, không chỉ 0 và 1.
--
--     0 = bài thường
--     1 = nổi bật TRONG LOẠI của nó
--     2 = nổi bật ở mục "TẤT CẢ"  (mức cao nhất)
--
-- Máy chủ sắp xếp giảm dần nên 2 luôn đứng trước 1, 1 đứng trước 0.
-- Không phải sửa mã nguồn, không phải thêm cột.
--
-- HOẠT ĐỘNG THẾ NÀO:
--   · Mục "Tất cả"  -> bài mức 2 lên đầu
--   · Lọc một loại  -> chỉ còn bài của loại đó; bài mức 1 của loại ấy lên đầu
--                      (nếu bài mức 2 cũng thuộc loại đó thì nó lên đầu)
-- ============================================================================


-- ── Đặt tin nổi bật cho mục "Tất cả" (thay 99 bằng id thật) ────────────────
--
-- ⚠️ Chạy CẢ HAI dòng. Bỏ dòng đầu thì có hai bài cùng mức 2, hệ thống lấy
--    bài mới hơn — không như ý.

UPDATE news SET is_featured = 1 WHERE is_featured = 2;   -- hạ bài cũ xuống mức loại
UPDATE news SET is_featured = 2 WHERE id = 99;           -- nâng bài mới lên


-- ── Xem toàn cảnh: bài nào đang ở mức nào ─────────────────────────────────
SELECT CASE is_featured
         WHEN 2 THEN '★★ Tất cả'
         WHEN 1 THEN '★  Trong loại'
         ELSE        '   Bài thường'
       END                        AS muc_do,
       category                   AS loai,
       id,
       LEFT(title, 50)            AS tieu_de
  FROM news
 WHERE is_featured > 0
 ORDER BY is_featured DESC, category;


-- ── Bỏ tin nổi bật ở mục "Tất cả", giữ nguyên nổi bật theo loại ────────────
--     UPDATE news SET is_featured = 1 WHERE is_featured = 2;
--
-- ── Bỏ sạch mọi đánh dấu, cả trang quay về lấy bài mới nhất ────────────────
--     UPDATE news SET is_featured = 0;
