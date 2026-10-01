-- ============================================================================
-- NÂNG CẤP V25 — BẢNG GIỮ CHỖ GỬI TIN (giới hạn đếm atomic)
-- ============================================================================
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (biến DB_NAME
-- trong server/.env).
USE hop_thu_an_ninh_so;

-- VÌ SAO (luật 6, ADR-003 việc 1):
-- Giới hạn "5 tin/giờ mỗi mạng", "2 tin ẩn danh/ngày" được kiểm bằng SELECT
-- COUNT rồi mới INSERT. Gửi dồn nhiều yêu cầu cùng lúc thì yêu cầu nào cũng đếm
-- thấy "chưa đủ". Bảng này cho mỗi yêu cầu GIỮ CHỖ theo khoá (mạng, số điện
-- thoại, nội dung — đều đã băm) trước khi đếm; khoá chính bảo đảm hai yêu cầu
-- cùng khoá không cùng giữ được. Xem server/src/lib/giu-cho-gui.js.
--
-- Bảng chỉ chứa chỗ đang giữ trong vài giây. Máy chủ tự xoá dòng của mình ngay
-- sau khi ghi đơn, và dọn mọi dòng quá hạn ở lượt gửi kế tiếp.
--
-- Chưa chạy tệp này thì máy chủ VẪN NHẬN TIN (như trước bản vá) và in cảnh báo
-- đỏ vào log: giới hạn gửi tin chưa chống được gửi dồn.
--
-- THỜI ĐIỂM: chạy trước hoặc sau khi cập nhật mã đều được.
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- ============================================================================

CREATE TABLE IF NOT EXISTS khoa_gui_tam (
  khoa     VARCHAR(80)  NOT NULL PRIMARY KEY COMMENT 'loại:giá trị đã băm (mang, sdt, noidung)',
  chu      CHAR(36)     NOT NULL COMMENT 'mã ngẫu nhiên của yêu cầu đang giữ — chỉ chủ mới trả chỗ',
  het_han  DATETIME(3)  NOT NULL COMMENT 'quá giờ này thì chỗ được coi là bỏ, lượt sau dọn',
  INDEX idx_khoa_gui_tam_het_han (het_han)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kiểm lại: phải ra 1 dòng
SHOW TABLES LIKE 'khoa_gui_tam';
