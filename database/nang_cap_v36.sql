SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V36 — LƯU ĐƯỢC THIẾT BỊ TIN CẬY (MÁY KI-ỐT DÙNG CHUNG) (ND-028)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO: lãnh đạo đánh dấu máy ki-ốt ở trụ sở là "thiết bị tin cậy" để một người
-- gửi tin rác không khoá máy dùng chung của mọi người sau đó. Máy chủ ghi dòng
-- blacklists.kind = 'trusted_device', nhưng cột chỉ khai ENUM('device','ip')
-- (nang_cap_v12.sql):
--   · MySQL chế độ nghiêm ngặt (mặc định của MySQL 8, Aiven): câu INSERT bị từ
--     chối "Data truncated for column 'kind'" — không đánh dấu được máy nào.
--   · Chế độ không nghiêm ngặt: dòng được ghi với kind = '' (chuỗi rỗng). Câu tra
--     "kind = 'trusted_device'" khi đi qua chỉ mục lại khớp TÌNH CỜ dòng rỗng (MySQL
--     đổi hằng không hợp lệ thành chỉ số 0), khi không đi qua chỉ mục thì không khớp
--     — máy ki-ốt lúc được miễn khoá, lúc không.
-- Bộ kiểm thử chạy SQLite (không có ENUM) nên không thấy; kiểm trên MySQL 8 thật ở
-- phiên P60.
--
-- LÀM GÌ:
--   1. Nới ENUM thêm 'trusted_device' (thêm vào CUỐI để chỉ số của 'device', 'ip'
--      giữ nguyên — không đụng dữ liệu đang có).
--   2. Khôi phục dòng tin cậy đã bị ghi thành chuỗi rỗng. Bắt buộc làm cùng bước 1:
--      nới ENUM xong thì hằng 'trusted_device' có chỉ số riêng, không còn khớp tình
--      cờ dòng rỗng nữa — bỏ bước này là máy đang được miễn khoá sẽ mất miễn khoá.
--      Chỉ đổi dòng rỗng có hạn rất xa (máy chủ ghi 100 năm cho thiết bị tin cậy;
--      khoá thiết bị thật chỉ 24 giờ hoặc 30 ngày).
--
-- QUYỀN: cần quyền ALTER trên bảng blacklists — chạy bằng tài khoản quản trị CSDL,
-- không phải tài khoản quyền hẹp của máy chủ.
--
-- THỜI ĐIỂM: chạy trước hay sau khi cập nhật mã đều được; không cần dừng máy chủ.
-- Chạy lại nhiều lần không lỗi, không đổi thêm gì. Sao lưu trước như mọi lần.
-- ============================================================================

-- 1. Nới cột (giữ NOT NULL như cũ)
ALTER TABLE blacklists
  MODIFY COLUMN kind ENUM('device','ip','trusted_device') NOT NULL;

-- 2. Khôi phục dòng tin cậy bị ghi rỗng ở máy chạy chế độ không nghiêm ngặt
UPDATE blacklists SET kind = 'trusted_device'
 WHERE kind = '' AND expires_at > DATE_ADD(NOW(), INTERVAL 50 YEAR);

-- KIỂM TRA:
--   · Dòng đầu phải ra enum('device','ip','trusted_device').
--   · con_dong_rong phải ra 0. Ra số khác 0: còn dòng kind rỗng có hạn ngắn — không
--     phải thiết bị tin cậy, KHÔNG chặn ai; báo người phụ trách xem tay.
SELECT column_type AS cot_kind FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'blacklists' AND column_name = 'kind';
SELECT COUNT(*) AS thiet_bi_tin_cay FROM blacklists WHERE kind = 'trusted_device';
SELECT COUNT(*) AS con_dong_rong FROM blacklists WHERE kind = '';
