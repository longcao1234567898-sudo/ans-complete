-- ============================================================================
-- DỌN TIN TỨC BỊ TRÙNG
-- ============================================================================
--
-- TRIỆU CHỨNG: một bài hiện HAI LẦN trên trang Tin tức — một lần ở khối nổi
-- bật phía trên, một lần ở thẻ đầu tiên bên dưới, mà lại kèm hai ảnh khác nhau.
--
-- NGUYÊN NHÂN: bảng news có hai dòng cùng tiêu đề. Giao diện lấy bài đầu làm
-- tin nổi bật rồi hiện phần còn lại bên dưới — nên bản sao thứ hai lộ ra ngay
-- dưới bản gốc. Không phải lỗi giao diện, mà là dữ liệu bị nạp trùng.
--
-- CÁCH DÙNG: HeidiSQL -> chọn database -> chạy BƯỚC 1 xem trước, rồi BƯỚC 2.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- BƯỚC 1 — XEM TRƯỚC: bài nào bị trùng
--
-- CHẠY RIÊNG bước này trước. Nhìn kết quả rồi mới quyết định xoá.
-- ---------------------------------------------------------------------------
SELECT
  n.title                                   AS tieu_de,
  COUNT(*)                                  AS so_ban_sao,
  GROUP_CONCAT(n.id ORDER BY n.id)          AS cac_id,
  MIN(n.id)                                 AS id_giu_lai,
  GROUP_CONCAT(
    CONCAT(n.id, ':', IFNULL(NULLIF(n.image_url, ''), '(không có ảnh)'))
    ORDER BY n.id SEPARATOR '  |  '
  )                                         AS anh_cua_tung_ban
FROM news n
GROUP BY n.title
HAVING COUNT(*) > 1
ORDER BY so_ban_sao DESC;


-- ---------------------------------------------------------------------------
-- BƯỚC 2 — XOÁ BẢN SAO, GIỮ LẠI BẢN TỐT NHẤT
--
-- Quy tắc giữ: trong các bản trùng, giữ bản CÓ ẢNH; nếu nhiều bản cùng có ảnh
-- thì giữ bản có id NHỎ NHẤT (bản nạp trước, thường là bản gốc).
--
-- ⚠️ Bỏ dấu chú thích (hai gạch ngang đầu dòng) rồi mới chạy. Xoá là không
--    khôi phục được — nên BƯỚC 1 ở trên phải xem kỹ trước.
-- ---------------------------------------------------------------------------

-- DELETE n FROM news n
--   JOIN (
--     SELECT title,
--            MIN(CASE WHEN image_url IS NOT NULL AND image_url <> ''
--                     THEN id END)  AS id_co_anh,
--            MIN(id)                AS id_nho_nhat
--       FROM news
--      GROUP BY title
--     HAVING COUNT(*) > 1
--   ) d ON d.title = n.title
--  WHERE n.id <> COALESCE(d.id_co_anh, d.id_nho_nhat);


-- ---------------------------------------------------------------------------
-- BƯỚC 3 — CHẶN TRÙNG VỀ SAU
--
-- Đặt ràng buộc để database TỰ từ chối bài trùng tiêu đề, không phải dọn tay
-- mỗi lần nạp tin.
--
-- ⚠️ Chỉ chạy được SAU khi BƯỚC 2 đã dọn sạch. Còn bản trùng thì lệnh này báo
--    lỗi 1062 — đó là dấu hiệu chưa dọn xong, không phải lỗi câu lệnh.
--
-- Dùng tiền tố 191 ký tự vì tiêu đề là kiểu văn bản dài, MySQL giới hạn độ dài
-- khoá chỉ mục.
-- ---------------------------------------------------------------------------

-- ALTER TABLE news ADD UNIQUE KEY uq_news_title (title(191));


-- ---------------------------------------------------------------------------
-- KIỂM TRA SAU KHI DỌN — phải trả về 0 dòng
-- ---------------------------------------------------------------------------
SELECT title, COUNT(*) AS so_ban_sao
  FROM news
 GROUP BY title
HAVING COUNT(*) > 1;
