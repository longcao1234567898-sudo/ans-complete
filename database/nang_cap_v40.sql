SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V40 — GỬI LẠI CÙNG MỘT LẦN KHÔNG TẠO ĐƠN TRÙNG (P91)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO: giao diện sẽ tự gửi lại khi mạng chập chờn hoặc khi có mạng trở lại.
-- Mạng đứt ĐÚNG lúc máy chủ đã lưu đơn mà chưa kịp trả lời thì lần gửi lại bị chặn
-- trùng nội dung -> người dân mất mã tra cứu và PIN phòng trao đổi. Mỗi lần gửi
-- mang một mã ngẫu nhiên; ba cột dưới nhớ mã đó đã thành đơn nào.
--
--   lan_gui_bam  băm HMAC của mã lần gửi (UNIQUE — ghi cùng câu INSERT đơn, nên
--                đơn và mã cùng có hoặc cùng không)
--   lan_gui_dau  dấu vân của cả lần gửi — cùng mã mà khác nội dung thì không trả lại
--   lan_gui_xong 1 = lần đầu đã lưu xong tệp; chưa có thì lần gửi lại không báo "đã nhận đủ tệp"
-- Chỉ là băm của một mã ngẫu nhiên dùng một lần: không nối được với gì. Máy chủ tự
-- xoá ba cột sau 24 giờ (bộ dọn dấu nối), và ngay khi xoá danh tính.
--
-- Chưa chạy tệp này thì máy chủ vẫn nhận ý kiến bình thường, chỉ không nhận ra lần
-- gửi lại. Chạy lại nhiều lần không sao. QUYỀN: cần quyền ALTER, DROP.
-- ============================================================================

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN lan_gui_bam CHAR(64) NULL DEFAULT NULL COMMENT ''băm mã lần gửi (P91) — tự xoá sau 24 giờ''',
    'SELECT ''cột lan_gui_bam đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'lan_gui_bam'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN lan_gui_dau CHAR(64) NULL DEFAULT NULL COMMENT ''dấu vân lần gửi (P91) — tự xoá sau 24 giờ''',
    'SELECT ''cột lan_gui_dau đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'lan_gui_dau'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN lan_gui_xong TINYINT(1) NULL DEFAULT NULL COMMENT ''1 = lần gửi đầu đã lưu xong tệp (P91)''',
    'SELECT ''cột lan_gui_xong đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'lan_gui_xong'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submissions ADD UNIQUE KEY uq_lan_gui_bam (lan_gui_bam)',
    'SELECT ''chỉ mục uq_lan_gui_bam đã có, bỏ qua''')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND index_name = 'uq_lan_gui_bam'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Bản đầu của P91 (chỉ có trên nhánh làm việc, chưa phát hành) dùng một bảng giữ mã
-- riêng — bỏ vì đơn và mã có thể lệch nhau khi CSDL rớt giữa chừng. Bảng chỉ chứa băm.
DROP TABLE IF EXISTS lan_gui_y_kien;
