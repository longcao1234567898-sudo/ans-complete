SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V24 — GỠ PHÂN CÔNG CŨ CỦA HỒ SƠ MẬT
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
-- VÌ SAO (BUG-009, ADR-002 §3):
-- Từ bản này, hồ sơ mức Mật chỉ Trưởng Công an xã (admin) và NGƯỜI TRƯỞNG GIAO
-- đọc được. Máy chủ giữ "người Trưởng giao" bằng hai chốt: chỉ admin phân công
-- được hồ sơ Mật, và nâng lên Mật thì gỡ người đang được giao.
-- Nhưng hồ sơ ĐÃ Mật từ trước bản này có thể đang giao cho người do Phó trưởng
-- (manager) chọn — trước đây manager giao được mọi hồ sơ. Để nguyên thì người
-- đó vẫn đọc được hồ sơ Mật mà Trưởng không hề chọn họ.
--
-- Một việc: bỏ người được giao của MỌI hồ sơ máy chủ coi là Mật. Trưởng xem
-- danh sách ở bước 1 rồi giao lại cho người mình chọn.
--
-- "Máy chủ coi là Mật" = mọi giá trị KHÔNG phải 'thuong' hay 'can_bao_ve':
-- 'mat', NULL, và chuỗi rỗng '' (MySQL chế độ không nghiêm ngặt lưu giá trị ENUM
-- lạ thành ''). Không đọc được mức thì máy chủ coi là Mật, nên tệp này cũng
-- phải gỡ giao những hồ sơ đó — lọc đúng = 'mat' là bỏ sót chúng.
--
-- KHÔNG làm ở tệp này:
--   · Không đổi mức của hồ sơ nào. Không đụng hồ sơ Thường, Cần bảo vệ.
--   · Không xoá nhật ký, lịch sử trạng thái, tin nhắn.
--   · Không ghi staff_activity_logs: bảng đòi staff_id là một cán bộ có thật,
--     mà việc này do người vận hành làm, không phải cán bộ nào. Danh sách ở
--     bước 1 là dấu vết — LƯU LẠI kết quả bước 1 trước khi chạy bước 2.
--   · updated_at của các hồ sơ bị gỡ giao sẽ đổi sang giờ chạy tệp (cột tự
--     đóng giờ khi sửa). Chấp nhận: đây đúng là một lần sửa hồ sơ.
--
-- CẦN CHẠY TRƯỚC: nang_cap_v14.sql (cột security_level). Thiếu thì báo
-- "Unknown column" và không đổi gì.
--
-- THỜI ĐIỂM: dừng máy chủ -> cập nhật mã -> chạy tệp này -> khởi động lại.
-- Chạy trước khi cập nhật mã thì trong khoảng trống mã cũ vẫn cho manager giao
-- lại; chạy sau khi máy chủ mới đã chạy lâu thì người được giao cũ đọc tiếp
-- trong khoảng đó.
--
-- NÊN SAO LƯU TRƯỚC KHI CHẠY. Không đảo ngược được (ngoài bằng bản sao lưu).
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- (MySQL Workbench bật "safe updates" sẽ từ chối câu UPDATE ở bước 2 — lỗi 1175. Câu
-- kiểm lại cuối tệp khi đó ra số khác 0: tắt safe updates rồi chạy lại.)
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- ============================================================================


-- 1. Hồ sơ Mật đang có người được giao — LƯU LẠI kết quả này (xuất CSV) để
--    Trưởng biết giao lại cho ai.
SELECT s.id, s.tracking_code, s.assigned_to, st.full_name AS nguoi_dang_duoc_giao, st.role AS vai_tro
  FROM submissions s
  LEFT JOIN staff st ON st.id = s.assigned_to
 WHERE (s.security_level IS NULL OR s.security_level NOT IN ('thuong', 'can_bao_ve'))
   AND s.assigned_to IS NOT NULL;


-- 2. Gỡ người được giao của mọi hồ sơ Mật.
UPDATE submissions
   SET assigned_to = NULL
 WHERE (security_level IS NULL OR security_level NOT IN ('thuong', 'can_bao_ve'))
   AND assigned_to IS NOT NULL;


-- Kiểm lại: số này phải bằng 0.
SELECT COUNT(*) AS ho_so_mat_con_nguoi_giao
  FROM submissions
 WHERE (security_level IS NULL OR security_level NOT IN ('thuong', 'can_bao_ve'))
   AND assigned_to IS NOT NULL;
