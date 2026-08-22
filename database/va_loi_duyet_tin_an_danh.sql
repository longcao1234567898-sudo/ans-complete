-- =============================================================================
--  VÁ LỖI: DUYỆT / ĐÁNH DẤU TIN RÁC BÁO "LỖI MÁY CHỦ" DÙ VIỆC ĐÃ CHẠY
-- =============================================================================
--
--  TRIỆU CHỨNG
--    Ở trang "Chờ duyệt", bấm "Duyệt" hoặc "Đánh dấu tin rác": ý kiến rời khỏi
--    hàng chờ đúng như mong muốn, nhưng phía trên hiện thông báo lỗi máy chủ.
--    Tải lại trang thì thấy việc đã xong. Cán bộ không biết nên tin cái nào.
--
--  NGUYÊN NHÂN
--    Route /api/admin/submissions/:id/review chạy ba lệnh nối nhau:
--      1. UPDATE submissions           -> đổi trạng thái      (CHẠY ĐƯỢC)
--      2. INSERT status_history        -> ghi lịch sử         (HỎNG Ở ĐÂY)
--      3. INSERT staff_activity_logs   -> ghi nhật ký         (không tới lượt)
--
--    Bảng status_history khai hai cột ENUM chỉ có 4 giá trị:
--        ENUM('received','processing','resolved','rejected')
--    Trong khi bảng submissions ĐÃ được nới thành 6 giá trị, thêm
--    'pending_review' và 'spam'.
--
--    Duyệt một tin ẩn danh nghĩa là ghi old_status = 'pending_review' — một
--    giá trị KHÔNG có trong ENUM. MySQL chạy ở chế độ nghiêm ngặt (mặc định từ
--    bản 5.7) nên báo lỗi 1265 "Data truncated" chứ không âm thầm bỏ qua.
--    Lệnh 2 ném lỗi, khối catch trả về mã 500, giao diện hiện "lỗi máy chủ".
--    Nhưng lệnh 1 đã chạy xong và KHÔNG nằm trong giao dịch nên không bị lùi.
--    Đó là lý do "báo lỗi mà vẫn làm được".
--
--    Cả hai nút đều dính, vì cùng ghi old_status = 'pending_review'.
--
--  VÌ SAO LỌT
--    Bản vá này vốn đã có trong nang_cap_v7.sql, nhưng TRON_BO_DATABASE_V5.sql
--    lúc gộp lại chỉ chép phần ALTER cho bảng submissions mà bỏ sót bảng
--    status_history. Ai dựng cơ sở dữ liệu từ tệp trọn bộ sẽ dính lỗi này,
--    còn ai nạp lần lượt từng bản nâng cấp thì không.
--
--  CÁCH CHẠY
--    Mở phpMyAdmin (hoặc MySQL Workbench) -> chọn cơ sở dữ liệu -> tab SQL ->
--    dán toàn bộ tệp này -> Go. Chạy lại nhiều lần cũng không sao.
-- =============================================================================

ALTER TABLE status_history
    MODIFY COLUMN old_status
    ENUM('pending_review','received','processing','resolved','rejected','spam')
    NULL;

ALTER TABLE status_history
    MODIFY COLUMN new_status
    ENUM('pending_review','received','processing','resolved','rejected','spam')
    NOT NULL;

-- -----------------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY
-- Cột Type của cả hai dòng phải liệt kê đủ 6 giá trị.
-- -----------------------------------------------------------------------------
SHOW COLUMNS FROM status_history LIKE '%_status';
