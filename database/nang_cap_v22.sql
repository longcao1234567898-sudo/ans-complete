SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V22 — ĐƠN ẨN DANH KHÔNG MANG MÃ MÁY, KHÔNG CÒN DÒNG KHOÁ LOẠI ẨN DANH
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BƯỚC 0 — CHỌN ĐÚNG CƠ SỞ DỮ LIỆU
-- ---------------------------------------------------------------------------
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (xem biến
-- DB_NAME trong tệp server/.env).
USE hop_thu_an_ninh_so;

--
-- VÌ SAO (BUG-017 phần nối, SEC-DEC-008 M-B):
-- Mã máy trên một tố giác ẩn danh không chỉ ra ai, nhưng nó nói "tố giác này và
-- đơn có tên kia gửi từ cùng một máy" — người cầm bản sao CSDL nối được người tố
-- giác với tên thật. Dòng khoá loại ẩn danh (blacklists.loai_don = 'an_danh') thì
-- nối hai tố giác của cùng một người: giờ khoá, người khoá, lý do khoá đặt cạnh
-- thùng rác và danh sách nghi rác. Từ bản này máy chủ không lưu mã máy cho đơn
-- ẩn danh và không bao giờ tạo dòng khoá loại ẩn danh. Tệp này dọn phần dữ liệu
-- ghi TRƯỚC đó.
--
-- Hai việc:
--   1. Xoá mã máy của mọi đơn ẩn danh. "Ẩn danh" gồm cả is_anonymous NULL (cột
--      cho phép NULL; quy ước của mã: không rõ thì coi là ẩn danh). Viết bằng
--      COALESCE(is_anonymous, 1) <> 0 — đúng biểu thức mã dùng — thay vì = 1, để
--      không bỏ sót giá trị nào khác 0.
--   2. Xoá MỌI dòng khoá loại ẩn danh — còn hạn lẫn hết hạn, khoá thiết bị lẫn
--      khoá IP. Soi theo cách mã cũ GHI (upsert ghi đè lý do/người khoá/hạn, giữ
--      created_at), không theo mẫu chuỗi lý do: xoá cả dòng.
--      ⚠️ KHÔNG đụng kind = 'trusted_device' (máy kiosk ở trụ sở).
--
-- KHÔNG làm ở tệp này:
--   · Đơn ẩn danh đã bị chặn ngầm từ trước (is_spam = 1) GIỮ NGUYÊN cờ đó. Cờ là
--     chốt "một đơn chỉ gây khoá một lần" của BUG-015.
--   · IP đã băm (ip_address) của đơn ẩn danh: giới hạn 2 đơn ẩn danh/ngày, thời
--     gian chờ, chặn trùng còn cần nó. Nó tự xoá sau 30 ngày (nang_cap_v21.sql).
--   · Mã máy trong khiếu nại cũ (unlock_appeals) — BUG-019.
--
-- ⚠️ updated_at = updated_at KHÔNG THỪA. Cột này là ON UPDATE CURRENT_TIMESTAMP:
-- bỏ đi thì mọi đơn ẩn danh bị sửa mang CÙNG giờ chạy tệp này — một danh sách
-- "đây là các đơn từng có mã máy", gom nhóm được theo giây.
--
-- CẦN CHẠY nang_cap_v19.sql TRƯỚC (cột blacklists.loai_don). Chưa chạy thì câu 2
-- báo lỗi "Unknown column 'loai_don'" và dừng — chạy v19 rồi chạy lại tệp này.
--
-- NÊN SAO LƯU TRƯỚC KHI CHẠY. Không đảo ngược được — đó chính là mục đích.
-- ⚠️ Bản sao lưu đó chứa ĐÚNG những dấu nối tệp này xoá. Cất nơi chỉ người vận
-- hành đọc được, và huỷ khi đã chắc tệp chạy đúng — giữ nó mãi là giữ lại thứ
-- vừa xoá.
--
-- Chạy tệp này TRƯỚC khi cập nhật mã máy chủ (SEC-DEC-008, điều kiện triển khai).
-- Máy chủ mới tự làm lại ĐỦ hai việc này mỗi giờ (server/src/lib/vong-doi-dau-noi.js),
-- nên dữ liệu mã cũ ghi trong khoảng giữa lúc chạy tệp này và lúc cập nhật mã
-- cũng được dọn ở lượt đầu tiên sau khi mã mới khởi động.
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- ============================================================================


-- 1. Mã máy trên đơn ẩn danh (is_anonymous khác 0 hoặc NULL)
UPDATE submissions
   SET device_id = NULL,
       updated_at = updated_at
 WHERE COALESCE(is_anonymous, 1) <> 0
   AND device_id IS NOT NULL;

-- 2. Mọi dòng khoá loại ẩn danh, còn hạn lẫn hết hạn. KHÔNG đụng trusted_device.
DELETE FROM blacklists
 WHERE kind IN ('device', 'ip')
   AND loai_don = 'an_danh';


-- Kiểm lại: hai số đầu phải bằng 0.
-- Bằng 0 chỉ nói hai câu trên đã chạy — KHÔNG chứng minh dữ liệu hết dấu nối.
SELECT COUNT(*) AS don_an_danh_con_ma_may
  FROM submissions WHERE COALESCE(is_anonymous, 1) <> 0 AND device_id IS NOT NULL;
SELECT COUNT(*) AS khoa_an_danh_con_lai
  FROM blacklists WHERE kind IN ('device', 'ip') AND loai_don = 'an_danh';

-- Thiết bị tin cậy phải còn nguyên (so với số trước khi chạy)
SELECT COUNT(*) AS thiet_bi_tin_cay FROM blacklists WHERE kind = 'trusted_device';
