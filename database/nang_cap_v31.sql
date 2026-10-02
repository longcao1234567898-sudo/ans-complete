SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V31 — ĐƯỜNG HAY NGẬP: CÁN BỘ BÁO "ĐANG NGẬP / HẾT NGẬP" TRÊN TRANG ĐIỂM ĐEN
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database — chạy
-- nhầm vào database khác là lỗi "No database selected" hoặc đổi nhầm nơi).
--
-- VÌ SAO:
-- Google Maps không có dịch vụ nào trả về "đường nào đang ngập" cho web khác lấy.
-- Nên danh sách tuyến ngập do CÁN BỘ giữ: đánh dấu trước các tuyến hay ngập, rồi
-- bấm "Đang ngập" / "Hết ngập" mỗi khi có mưa lớn. Người dân thấy trạng thái đó
-- trên trang Điểm đen giao thông, kèm nút chỉ đường bằng Google Maps.
--
-- THÊM HAI CỘT vào traffic_hotspots:
--   loai               'tai_nan' (điểm đen tai nạn, như cũ) | 'ngap' (đường hay ngập)
--   ngap_xac_nhan_luc  lúc cán bộ XÁC NHẬN lần cuối là đang ngập; NULL = không có
--                      xác nhận. Không có cột "đang ngập" riêng: máy chủ chỉ coi là
--                      đang ngập khi xác nhận còn trong 12 giờ, nên quên bấm "Hết
--                      ngập" thì trang tự hết báo sau 12 giờ, không treo báo sai mãi.
--
-- THỜI ĐIỂM: chạy trước hay sau khi cập nhật mã đều được. Mã mới chạy khi chưa có
-- hai cột thì trang người dân vẫn hiện điểm tai nạn như cũ (không có phần ngập).
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì. Dữ liệu cũ giữ nguyên:
-- mọi điểm đang có mặc định là 'tai_nan'.
-- ============================================================================

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE traffic_hotspots ADD COLUMN loai ENUM(''tai_nan'',''ngap'') NOT NULL DEFAULT ''tai_nan'' COMMENT ''tai_nan = điểm đen tai nạn; ngap = đường hay ngập''',
    'SELECT ''cột loai đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'traffic_hotspots' AND column_name = 'loai'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE traffic_hotspots ADD COLUMN ngap_xac_nhan_luc DATETIME NULL DEFAULT NULL COMMENT ''Lúc cán bộ xác nhận đang ngập lần cuối; NULL = không xác nhận''',
    'SELECT ''cột ngap_xac_nhan_luc đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'traffic_hotspots' AND column_name = 'ngap_xac_nhan_luc'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- KIỂM TRA: phải ra 2 dòng (loai, ngap_xac_nhan_luc)
SELECT column_name AS cot_moi, column_type AS kieu
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'traffic_hotspots'
   AND column_name IN ('loai', 'ngap_xac_nhan_luc');
