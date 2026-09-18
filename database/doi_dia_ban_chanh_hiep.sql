-- ============================================================================
-- CHUYỂN ĐỊA BÀN SANG PHƯỜNG CHÁNH HIỆP, THÀNH PHỐ HỒ CHÍ MINH
-- ============================================================================
--
-- ⚠️ ĐỊA GIỚI HÀNH CHÍNH HIỆN HÀNH
--
-- Từ 01/7/2025, theo Nghị quyết 202/2025/QH15, toàn bộ tỉnh Bình Dương sáp
-- nhập vào Thành phố Hồ Chí Minh. TỈNH BÌNH DƯƠNG KHÔNG CÒN TỒN TẠI.
--
-- Phường Chánh Hiệp được lập theo Nghị quyết 1685/NQ-UBTVQH15, từ toàn bộ
-- phường Định Hoà và phường Tương Bình Hiệp cũ của thành phố Thủ Dầu Một,
-- nay trực thuộc Thành phố Hồ Chí Minh. Trụ sở đặt tại Tương Bình Hiệp cũ.
--
-- Vì hệ thống mang tên cơ quan công an nên ghi "tỉnh Bình Dương" là sai địa
-- giới hiện hành — tệp này dùng tên đúng.
--
-- ⚠️ ĐỊA BÀN NAY LÀ KHU PHỐ, KHÔNG PHẢI PHƯỜNG
--
-- Trước đây hệ thống phục vụ cấp thị xã nên bảng wards chứa các phường/xã.
-- Nay phục vụ cấp phường, nên bảng này chứa các KHU PHỐ trong phường Chánh
-- Hiệp. Tên bảng giữ nguyên để không phải sửa mã.
--
-- ⚠️ TOẠ ĐỘ LÀ SỐ GẦN ĐÚNG, cán bộ nên chỉnh lại cho khớp thực địa: mở Google
--    Maps, bấm chuột phải vào trung tâm khu phố, chép dãy số hiện ra.
--
-- CHẠY: HeidiSQL -> dán toàn bộ -> F9. Chạy lại nhiều lần không sao.
-- ============================================================================

USE hop_thu_an_ninh_so;


-- ---------------------------------------------------------------------------
-- 1. XOÁ ĐỊA BÀN CŨ
-- ---------------------------------------------------------------------------
--
-- ⚠️ Ý kiến đã gửi có tham chiếu tới địa bàn. Gỡ tham chiếu trước rồi mới xoá,
--    nếu không khoá ngoại chặn lại và câu lệnh hỏng giữa chừng.
--    Ý kiến cũ sẽ không còn gắn địa bàn — chấp nhận được vì địa bàn cũ nay
--    không còn thuộc đơn vị này nữa.

UPDATE submissions SET ward_id = NULL WHERE ward_id IS NOT NULL;
UPDATE qr_points SET ward_id = NULL WHERE ward_id IS NOT NULL;
DELETE FROM incident_groups;
DELETE FROM wards;
ALTER TABLE wards AUTO_INCREMENT = 1;


-- ---------------------------------------------------------------------------
-- 2. NẠP KHU PHỐ CỦA PHƯỜNG CHÁNH HIỆP
-- ---------------------------------------------------------------------------

INSERT INTO wards (name, lat, lng, display_order) VALUES
  ('Khu phố Tương Bình Hiệp',  11.0180000, 106.6480000, 1),
  ('Khu phố Chánh Thiện',      11.0135000, 106.6520000, 2),
  ('Khu phố Chánh Lộc',        11.0090000, 106.6555000, 3),
  ('Khu phố Định Hoà',         11.0245000, 106.6600000, 4),
  ('Khu phố Hoà Long',         11.0300000, 106.6455000, 5),
  ('Khu phố Bình Hoà',         11.0060000, 106.6420000, 6),
  ('Khu phố Bình Đức',         11.0215000, 106.6390000, 7),
  ('Khu phố Bình Hiệp',        11.0150000, 106.6640000, 8);


-- ---------------------------------------------------------------------------
-- 3. ĐỔI TÊN ĐƠN VỊ TRONG BẢNG CẤU HÌNH
-- ---------------------------------------------------------------------------
--
-- Cột tên là `key` và `value` — phải bọc dấu huyền vì "key" là từ khoá MySQL.

UPDATE system_settings
   SET `value` = 'Điểm Chạm An Ninh'
 WHERE `key` = 'site_name';


-- ---------------------------------------------------------------------------
-- 4. DỌN DỮ LIỆU CŨ GẮN VỚI ĐỊA BÀN CŨ
-- ---------------------------------------------------------------------------
--
-- Tin tức và điểm đen giao thông của địa bàn cũ không còn đúng với đơn vị mới.
-- Ẩn đi thay vì xoá, để còn tra lại được nếu cần.

UPDATE news SET is_published = 0
 WHERE title LIKE '%Tân Châu%' OR content LIKE '%Tân Châu%'
    OR title LIKE '%An Giang%' OR content LIKE '%An Giang%';

UPDATE traffic_hotspots SET is_published = 0 WHERE 1 = 1;


-- ---------------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY
-- ---------------------------------------------------------------------------
SELECT id, name, lat, lng FROM wards ORDER BY display_order;
SELECT `key`, `value` FROM system_settings WHERE `key` = 'site_name';
SELECT COUNT(*) AS tin_con_hien FROM news WHERE is_published = 1;
