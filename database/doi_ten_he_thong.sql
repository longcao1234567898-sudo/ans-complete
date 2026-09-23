-- ============================================================================
-- ĐỔI TÊN HỆ THỐNG TRONG CƠ SỞ DỮ LIỆU ĐANG CHẠY
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BƯỚC 0 — CHỌN ĐÚNG CƠ SỞ DỮ LIỆU
-- ---------------------------------------------------------------------------
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
--
-- HeidiSQL không tự biết chạy vào cơ sở dữ liệu nào, nên phải nói rõ. Cách
-- khác: bấm đúp vào tên cơ sở dữ liệu ở khung bên trái cho tên đậm lên, rồi
-- mới bấm F9.
--
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (xem biến
-- DB_NAME trong tệp server/.env).
USE hop_thu_an_ninh_so;

--
-- Vì sao cần chạy riêng: đổi tên trong mã nguồn chỉ sửa chữ hiện trên giao
-- diện. Tên hệ thống còn nằm trong BẢNG CẤU HÌNH của cơ sở dữ liệu đang chạy,
-- và trong nội dung một số bản tin đã đăng — những chỗ đó mã nguồn không đụng
-- tới được.
--
-- Không chạy tệp này thì tên cũ vẫn hiện ở: tiêu đề thư gửi cho bà con, một số
-- bản tin cũ, và các chỗ đọc tên từ bảng cấu hình.
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không sao.
-- ============================================================================

-- 1. Bảng cấu hình hệ thống
--
-- ⚠️ Cột tên là `key` và `value` — phải bọc dấu huyền vì "key" là từ khoá của
--    MySQL, để trần thì máy hiểu nhầm thành lệnh.
UPDATE system_settings
   SET `value` = 'Điểm Chạm An Ninh'
 WHERE `key` = 'site_name';

-- 2. Nội dung các bản tin đã đăng
UPDATE news
   SET title   = REPLACE(title,   'Hộp Thư An Ninh Số', 'Điểm Chạm An Ninh'),
       summary = REPLACE(summary, 'Hộp Thư An Ninh Số', 'Điểm Chạm An Ninh'),
       content = REPLACE(content, 'Hộp Thư An Ninh Số', 'Điểm Chạm An Ninh')
 WHERE title   LIKE '%Hộp Thư An Ninh Số%'
    OR summary LIKE '%Hộp Thư An Ninh Số%'
    OR content LIKE '%Hộp Thư An Ninh Số%';

-- 3. Bắt cả biến thể "Hộp Thư Số"
UPDATE news
   SET title   = REPLACE(title,   'Hộp Thư Số', 'Điểm Chạm An Ninh'),
       summary = REPLACE(summary, 'Hộp Thư Số', 'Điểm Chạm An Ninh'),
       content = REPLACE(content, 'Hộp Thư Số', 'Điểm Chạm An Ninh')
 WHERE title   LIKE '%Hộp Thư Số%'
    OR summary LIKE '%Hộp Thư Số%'
    OR content LIKE '%Hộp Thư Số%';

-- ============================================================================
-- KIỂM TRA SAU KHI CHẠY — phải trả về 0 dòng
-- ============================================================================
SELECT 'system_settings' AS bang, `value` AS con_ten_cu
  FROM system_settings
 WHERE `key` = 'site_name' AND `value` LIKE '%Hộp Thư%'
UNION ALL
SELECT 'news', title FROM news WHERE title LIKE '%Hộp Thư%' LIMIT 10;
