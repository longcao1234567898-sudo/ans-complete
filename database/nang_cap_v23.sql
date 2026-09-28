-- ============================================================================
-- NÂNG CẤP V23 — BỎ HẲN KHOÁ THEO ĐỊA CHỈ MẠNG (dòng blacklists kind = 'ip')
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
-- VÌ SAO (BUG-016, SEC-DEC-008 G1):
-- Máy chủ từng khoá theo địa chỉ mạng (IP) khi cán bộ đánh rác một hồ sơ không
-- có mã máy, và tự khoá IP khi 3 đơn rác từ 3 máy cùng một IP trong 1 giờ. Lớp
-- đó chưa từng có tác dụng (lưu IP đã băm, kiểm bằng IP thô), và nếu sửa cho
-- chạy thì một cú bấm lên đơn gửi qua 4G chặn ngầm cả vùng thuê bao dùng chung
-- địa chỉ. Từ bản này máy chủ không tạo, cũng không đọc dòng kind = 'ip' nào.
-- Tệp này xoá các dòng mã cũ đã ghi — chúng không chặn ai nữa, nhưng vẫn hiện ở
-- trang "Danh sách khoá" như thể đang khoá, và mang IP đã băm của người gửi.
--
-- Một việc: xoá MỌI dòng kind = 'ip' — mọi loại đơn (co_ten, an_danh,
-- khong_ro), còn hạn lẫn hết hạn. Soi theo cách mã cũ GHI (upsert ghi đè lý
-- do/người khoá/hạn, giữ created_at), không theo mẫu chuỗi lý do: xoá cả dòng.
--
-- KHÔNG làm ở tệp này:
--   · Khoá thiết bị (kind = 'device') và máy kiosk tin cậy (kind = 'trusted_device')
--     giữ nguyên.
--   · Không đổi ENUM của cột kind: khiếu nại cũ (unlock_appeals.kind) cùng kiểu,
--     và bỏ giá trị khỏi ENUM mà còn dòng mang nó là lỗi. Mã chặn ghi mới ở tầng
--     ứng dụng (test R5 trong server/tests/bo-khoa-ip.test.js canh việc đó).
--   · IP đã băm trên đơn (submissions.ip_address): giới hạn 5 đơn/giờ, 2 đơn ẩn
--     danh/ngày, thời gian chờ, chặn trùng còn cần nó. Nó tự xoá sau 30 ngày
--     (nang_cap_v21.sql).
--   · Không đụng bảng submissions, nên không đóng dấu updated_at của đơn nào.
--
-- KHÔNG cần chạy tệp nào khác trước. Khoá IP mã cũ ghi có hạn 2 giờ, và máy
-- chủ tự dọn dòng hết hạn mỗi giờ (server/src/lib/vong-doi-dau-noi.js), nên quên
-- tệp này thì dòng cũ cũng tự hết trong vài giờ — nhưng chạy tệp là sạch ngay.
--
-- NÊN SAO LƯU TRƯỚC KHI CHẠY. Không đảo ngược được.
--
-- Chạy tệp này TRƯỚC khi cập nhật mã máy chủ (SEC-DEC-008, điều kiện triển khai).
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- ============================================================================


-- 1. Mọi dòng khoá theo địa chỉ mạng. KHÔNG đụng device, trusted_device.
DELETE FROM blacklists
 WHERE kind = 'ip';


-- Kiểm lại: số đầu phải bằng 0.
-- Bằng 0 chỉ nói câu trên đã chạy — KHÔNG chứng minh mã máy chủ đã hết đường ghi.
SELECT COUNT(*) AS khoa_ip_con_lai FROM blacklists WHERE kind = 'ip';

-- Khoá thiết bị và thiết bị tin cậy phải còn nguyên (so với số trước khi chạy)
SELECT kind, COUNT(*) AS so_dong FROM blacklists GROUP BY kind;
