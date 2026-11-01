SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- XOÁ 4 HỒ SƠ MẪU DEMO01–DEMO04 TRÊN MÁY CHẠY THẬT (ND-085)
-- ============================================================================
--
-- TRON_BO_DATABASE_V5.sql nạp 4 hồ sơ mẫu (tên giả "... Demo", chữ thường) để máy
-- thử có sẵn dữ liệu. Cài MỚI trên máy chạy thật thì chạy tệp này một lần ngay sau
-- khi cài xong (README mục 3). Chạy lại nhiều lần không sao.
--
-- CHỐT: chỉ xoá hồ sơ mang ĐÚNG mã mẫu VÀ tên giả chữ thường. Hồ sơ thật luôn có
-- danh tính mã hoá ("enc:...") hoặc ẩn danh (NULL) — không bao giờ khớp, kể cả khi
-- trùng mã. Bảng con (lịch sử, ảnh, tin trao đổi, ghi chú...) tự xoá theo khoá ngoại
-- ON DELETE CASCADE. Nhật ký cán bộ không gắn khoá ngoại nên không bị đụng.
--
-- Sao lưu (mysqldump) trước khi chạy trên CSDL đang dùng.
-- ============================================================================

DELETE FROM submissions
 WHERE tracking_code IN ('DEMO01', 'DEMO02', 'DEMO03', 'DEMO04')
   AND sender_name LIKE '% Demo'
   AND sender_name NOT LIKE 'enc:%';

SELECT ROW_COUNT() AS so_ho_so_mau_da_xoa;
