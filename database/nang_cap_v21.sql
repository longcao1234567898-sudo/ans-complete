SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V21 — VÒNG ĐỜI DẤU NỐI: XOÁ DÒNG KHOÁ CŨ KHONG_RO VÀ ĐÃ HẾT HẠN, XOÁ MÃ MÁY KHI
--                XOÁ DANH TÍNH, XOÁ MÃ MÁY VÀ IP ĐÃ BĂM CỦA ĐƠN QUÁ 30 NGÀY
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
-- VÌ SAO (BUG-014, SEC-DEC-008):
-- Mã máy (submissions.device_id) và IP đã băm (submissions.ip_address) không chỉ
-- ra ai, nhưng hai đơn cùng giá trị là hai đơn từ cùng một máy / một mạng — một
-- DẤU NỐI. Chống spam chỉ cần chúng trong 30 ngày. Từ bản này máy chủ tự xoá
-- chúng khi quá 30 ngày (server/src/lib/vong-doi-dau-noi.js) và khi xoá danh
-- tính (server/src/routes/tracking.js, routes/admin/submissions.js). Tệp này dọn
-- phần dữ liệu ghi TRƯỚC đó.
--
-- Bốn việc:
--   1. Xoá dòng khoá cũ loai_don = 'khong_ro' (kind 'device' và 'ip'). Chúng
--      KHÔNG chặn gì từ v19 (kiểm khoá, khiếu nại, gỡ khoá chỉ đọc 'an_danh' /
--      'co_ten'), nhưng vẫn hiện ở danh sách khoá. Mã cũ giữ MỘT dòng mỗi máy và
--      ghi đè lý do / người khoá / hạn mà GIỮ created_at, nên một dòng có thể mang
--      giờ của đơn này và lý do của đơn khác loại — tự nó là dấu nối. Soi theo
--      cách mã cũ GHI (upsert ghi đè một phần), không theo mẫu chuỗi: xoá cả dòng.
--      ⚠️ KHÔNG đụng kind = 'trusted_device': v19 cũng gắn 'khong_ro' cho thiết
--      bị tin cậy. Xoá nó là máy kiosk ở trụ sở bị khoá oan ở lần "Tin rác" sau.
--   2. Đơn đã xoá danh tính: xoá mã máy (IP đã xoá sẵn lúc xoá danh tính).
--   3. Đơn quá 30 ngày: xoá mã máy và IP đã băm.
--   4. Xoá mọi dòng khoá thiết bị / địa chỉ mạng ĐÃ HẾT HẠN, mọi loại đơn. Hết hạn
--      là không chặn gì, nhưng dòng đó vẫn giữ mã máy cùng giờ khoá và người khoá:
--      ghép với lịch sử đơn là ra lại đơn nào gây khoá, dù đơn đã mất mã máy.
--
-- Máy chủ mới tự làm lại ĐỦ bốn việc này mỗi giờ (server/src/lib/vong-doi-dau-noi.js),
-- nên dữ liệu mã cũ ghi trong khoảng giữa lúc chạy tệp này và lúc cập nhật mã
-- cũng được dọn ở lượt đầu tiên sau khi mã mới khởi động.
--
-- KHÔNG làm ở tệp này (SEC-DEC-008, thứ tự phiên FIX):
--   · Mã máy của đơn ẨN DANH còn trong 30 ngày — tệp nâng cấp của phiên sau.
--   · IP thô ở các bảng khác (unlock_appeals, otp_codes, data_deletion_requests).
--   · Mã máy trong khiếu nại cũ (unlock_appeals.identifier, .device_id).
--
-- ⚠️ updated_at = updated_at KHÔNG THỪA. Cột này là ON UPDATE CURRENT_TIMESTAMP:
-- bỏ đi thì mọi đơn bị sửa mang CÙNG giờ chạy tệp này, gom nhóm được theo giây.
--
-- CẦN CHẠY nang_cap_v19.sql TRƯỚC (cột blacklists.loai_don). Chưa chạy thì câu 1
-- báo lỗi "Unknown column 'loai_don'" và dừng — chạy v19 rồi chạy lại tệp này.
--
-- NÊN SAO LƯU TRƯỚC KHI CHẠY. Không đảo ngược được — đó chính là mục đích. Sau
-- 30 ngày không còn đối chiếu được IP để truy kẻ phá (SEC-DEC-008, đánh đổi 4).
-- ⚠️ Bản sao lưu đó chứa ĐÚNG những dấu nối tệp này xoá. Cất nơi chỉ người vận
-- hành đọc được, và huỷ khi đã chắc tệp chạy đúng — giữ nó mãi là giữ lại thứ
-- vừa xoá.
--
-- Chạy tệp này TRƯỚC khi cập nhật mã máy chủ (SEC-DEC-008, điều kiện triển khai).
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- ============================================================================


-- 1. Dòng khoá cũ không rõ loại — không chặn gì, chỉ còn là dấu nối
DELETE FROM blacklists
 WHERE kind IN ('device', 'ip')
   AND loai_don = 'khong_ro';

-- 2. Đơn đã xoá danh tính: mã máy
UPDATE submissions
   SET device_id = NULL,
       updated_at = updated_at
 WHERE identity_erased = 1
   AND device_id IS NOT NULL;

-- 3. Đơn quá 30 ngày: mã máy và IP đã băm (cùng câu với lib/vong-doi-dau-noi.js)
UPDATE submissions
   SET device_id = NULL,
       ip_address = NULL,
       updated_at = updated_at
 WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
   AND (device_id IS NOT NULL OR ip_address IS NOT NULL);

-- 4. Dòng khoá đã hết hạn — không chặn gì, chỉ còn là dấu nối. KHÔNG đụng trusted_device.
DELETE FROM blacklists
 WHERE kind IN ('device', 'ip')
   AND expires_at < NOW();


-- Kiểm lại: bốn số đầu phải bằng 0.
-- Bằng 0 chỉ nói bốn câu trên đã chạy — KHÔNG chứng minh dữ liệu hết dấu nối.
-- Dấu nối còn lại đã biết nằm trong 30 ngày gần nhất, đúng như thiết kế.
SELECT COUNT(*) AS khoa_khong_ro_con_lai
  FROM blacklists WHERE kind IN ('device', 'ip') AND loai_don = 'khong_ro';
SELECT COUNT(*) AS don_xoa_danh_tinh_con_ma_may
  FROM submissions WHERE identity_erased = 1 AND device_id IS NOT NULL;
SELECT COUNT(*) AS don_qua_30_ngay_con_dau_noi
  FROM submissions
 WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
   AND (device_id IS NOT NULL OR ip_address IS NOT NULL);
SELECT COUNT(*) AS khoa_het_han_con_lai
  FROM blacklists WHERE kind IN ('device', 'ip') AND expires_at < NOW();

-- Thiết bị tin cậy phải còn nguyên (so với số trước khi chạy)
SELECT COUNT(*) AS thiet_bi_tin_cay FROM blacklists WHERE kind = 'trusted_device';
