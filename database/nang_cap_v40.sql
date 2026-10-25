SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V40 — GỬI LẠI CÙNG MỘT LẦN KHÔNG TẠO ĐƠN TRÙNG (P91)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO: giao diện sẽ tự gửi lại khi mạng chập chờn hoặc khi có mạng trở lại.
-- Mạng đứt ĐÚNG lúc máy chủ đã nhận đơn mà chưa kịp trả lời thì lần gửi lại bị chặn
-- trùng nội dung -> người dân mất mã tra cứu và PIN phòng trao đổi (PIN chỉ trả một
-- lần). Mỗi lần gửi mang một mã ngẫu nhiên; bảng này nhớ mã đó đã thành đơn nào.
--
-- Chỉ giữ BẢN BĂM của mã (khác miền với mọi bảng khác), sống 1 ngày rồi tự xoá.
-- Chưa chạy tệp này thì máy chủ vẫn nhận ý kiến bình thường, chỉ không nhận ra lần
-- gửi lại. Chạy lại nhiều lần không sao. QUYỀN: cần quyền CREATE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lan_gui_y_kien (
  khoa          CHAR(64)     NOT NULL COMMENT 'băm mã lần gửi (lib/lan-gui.js) — không phải mã gốc',
  submission_id INT          NULL     COMMENT 'NULL = đang xử lý; có số = đã thành đơn',
  tao_luc       DATETIME     NOT NULL,
  PRIMARY KEY (khoa),
  KEY idx_tao_luc (tao_luc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
