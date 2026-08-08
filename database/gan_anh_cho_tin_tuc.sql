-- =====================================================================
-- GẮN ẢNH CHO 12 TIN TỨC
--
-- ⚠️ CHẠY FILE NÀY SAU KHI ĐÃ CHẠY `tin_tuc_moi_thang_7_2026.sql`
--
-- CÁCH CHẠY: HeidiSQL -> chọn hop_thu_an_ninh_so -> tab Query
--            -> dán TOÀN BỘ file này -> F9
--
-- KHÔNG cần deploy. Chạy xong bấm F5 trên web là thấy ảnh.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- BƯỚC 1: XEM ID CỦA 12 TIN VỪA NẠP (làm trước để biết id)
-- ---------------------------------------------------------------
SELECT id, LEFT(title, 50) AS tieu_de, category
FROM news
ORDER BY id DESC
LIMIT 12;

-- ---------------------------------------------------------------
-- BƯỚC 2: GẮN ẢNH THEO TIÊU ĐỀ (không cần biết id — chạy được ngay)
--
-- Dùng 4 ảnh danh thắng An Giang ĐÃ CÓ SẴN trên web của bạn
-- (public/media/) -> luôn tải được, không lo hỏng link, không vướng
-- bản quyền như lấy ảnh từ báo về.
-- ---------------------------------------------------------------

-- === Nhóm AN NINH TRẬT TỰ -> Núi Sam (trang nghiêm) ===
UPDATE news SET image_url = '/media/bg-nui-sam.webp'
WHERE title LIKE '%80 năm Ngày truyền thống%';

UPDATE news SET image_url = '/media/bg-nui-cam.webp'
WHERE title LIKE '%Tội phạm về trật tự xã hội tại An Giang giảm%';

UPDATE news SET image_url = '/media/bg-ho-tinh-tam.webp'
WHERE title LIKE '%APEC 2027%';

UPDATE news SET image_url = '/media/bg-lang-noi.webp'
WHERE title LIKE '%Niềm tin số tỉnh An Giang%';

-- === Nhóm CẢNH GIÁC ===
UPDATE news SET image_url = '/media/bg-nui-cam.webp'
WHERE title LIKE '%World Cup 2026%';

UPDATE news SET image_url = '/media/bg-ho-tinh-tam.webp'
WHERE title LIKE '%lừa đảo chiếm đoạt tài sản%';

UPDATE news SET image_url = '/media/bg-nui-sam.webp'
WHERE title LIKE '%tội phạm công nghệ cao%';

-- === Nhóm HƯỚNG DẪN ===
UPDATE news SET image_url = '/media/bg-lang-noi.webp'
WHERE title LIKE '%VNeID%';

UPDATE news SET image_url = '/media/bg-nui-cam.webp'
WHERE title LIKE '%số hóa hồ sơ%';

UPDATE news SET image_url = '/media/bg-ho-tinh-tam.webp'
WHERE title LIKE '%cải cách thủ tục hành chính%';

-- === Nhóm VĂN BẢN ===
UPDATE news SET image_url = '/media/bg-nui-sam.webp'
WHERE title LIKE '%Nghị quyết số 10-NQ/TW%';

UPDATE news SET image_url = '/media/bg-lang-noi.webp'
WHERE title LIKE '%Công điện số 47%';

-- ---------------------------------------------------------------
-- BƯỚC 3: KIỂM TRA — cả 12 tin phải có ảnh
-- ---------------------------------------------------------------
SELECT id, LEFT(title, 45) AS tieu_de, image_url
FROM news
WHERE is_published = TRUE
ORDER BY published_at DESC;

-- Đếm tin CHƯA có ảnh (phải ra 0)
SELECT COUNT(*) AS tin_chua_co_anh
FROM news
WHERE is_published = TRUE AND (image_url IS NULL OR image_url = '');


-- =====================================================================
-- (NÂNG CAO) THAY BẰNG ẢNH THẬT TỪ BÁO — làm khi có thời gian
-- =====================================================================
--
-- Ảnh danh thắng ở trên chỉ là ảnh nền cho đẹp. Muốn ảnh ĐÚNG NỘI DUNG
-- từng tin (ảnh hội nghị, ảnh tuyên truyền...) thì làm như sau:
--
-- BƯỚC A — Lấy ảnh:
--   1. Mở bài báo gốc (VD: congan.angiang.gov.vn)
--   2. Chuột phải vào ảnh -> "Lưu hình ảnh thành..." -> lưu về máy
--
-- BƯỚC B — Đưa ảnh lên mạng:
--   1. Vào https://imgbb.com  (miễn phí, không cần đăng ký)
--   2. Kéo ảnh vào -> Upload
--   3. Chọn ô "Direct links" -> copy đường link
--   4. Link ĐÚNG có dạng:  https://i.ibb.co/xxxxx/anh.jpg
--      (chú ý phải có "i." ở đầu và đuôi .jpg/.png)
--
-- BƯỚC C — Thử link:
--   Dán link vào thanh địa chỉ trình duyệt:
--     - Ra ĐÚNG tấm ảnh trần, nền trắng  -> link đúng ✅
--     - Ra trang web có nút bấm, quảng cáo -> link SAI ❌
--
-- BƯỚC D — Cập nhật (đổi id và link cho đúng):
--
--   UPDATE news SET image_url = 'https://i.ibb.co/xxxxx/hoi-nghi.jpg' WHERE id = 25;
--   UPDATE news SET image_url = 'https://i.ibb.co/yyyyy/tuyen-truyen.jpg' WHERE id = 26;
--
-- Muốn quay lại ảnh danh thắng: chạy lại BƯỚC 2 ở trên.
-- Muốn bỏ ảnh hẳn:  UPDATE news SET image_url = NULL WHERE id = 25;
--
-- ⚠️ KHÔNG nên copy thẳng link ảnh từ báo (chuột phải -> Sao chép địa chỉ
--    hình ảnh) rồi dán vào đây. Nhiều báo CHẶN hotlink -> ảnh sẽ vỡ,
--    và về lâu dài họ đổi đường dẫn là ảnh mất.
-- =====================================================================
