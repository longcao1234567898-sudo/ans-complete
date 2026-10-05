SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V34 — NGƯỠNG MƯA RIÊNG CHO TỪNG ĐƯỜNG HAY NGẬP, HỌC TỪ CÁC LẦN BÁO NGẬP
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO: dự báo mưa (P51) dùng ngưỡng của ngành khí tượng — ngưỡng cả nước.
-- Mỗi tuyến ngập ở một mức mưa khác nhau (cống, độ trũng, triều). Hai bảng này cho
-- hệ thống học từ chính địa bàn:
--
--   ngap_theo_mua      mỗi lần cán bộ bấm "Đang ngập", máy ghi lượng mưa lúc đó
--                      (mưa dồn 3 giờ lớn nhất trong 12 giờ trước, tổng 12 giờ — số
--                      của mô hình thời tiết Open-Meteo). Từ 3 lần trở lên trang cán
--                      bộ GỢI Ý ngưỡng cho tuyến.
--   nguong_ngap_duong  ngưỡng riêng LÃNH ĐẠO đặt cho tuyến (mm mưa dồn 3 giờ). Có
--                      ngưỡng thì dự báo báo "nguy cơ ngập" cho tuyến khi mưa dồn 3
--                      giờ đạt ngưỡng; không có thì theo mức chung như trước.
--
-- Xoá đường khỏi danh sách là xoá luôn ngưỡng và lịch sử của nó (ON DELETE CASCADE).
--
-- TÀI KHOẢN MYSQL QUYỀN HẸP (cấp quyền từng bảng): cấp thêm cho hai bảng mới:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON <database>.nguong_ngap_duong TO '<tài khoản>'@'<máy>';
--   GRANT SELECT, INSERT ON <database>.ngap_theo_mua TO '<tài khoản>'@'<máy>';
--
-- THỜI ĐIỂM: chạy trước hay sau khi cập nhật mã đều được; chưa chạy thì mọi tuyến
-- theo mức chung, không ghi lịch sử. Chạy lại nhiều lần không lỗi, không đổi dữ liệu.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nguong_ngap_duong (
  hotspot_id INT NOT NULL,
  nguong_mua_3h SMALLINT UNSIGNED NOT NULL COMMENT 'mm mưa dồn 3 giờ từ đó tuyến có nguy cơ ngập',
  cap_nhat_boi INT NULL DEFAULT NULL,
  cap_nhat_luc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (hotspot_id),
  CONSTRAINT fk_nguong_ngap_duong FOREIGN KEY (hotspot_id) REFERENCES traffic_hotspots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ngap_theo_mua (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  hotspot_id INT NOT NULL,
  xac_nhan_luc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mua_3h_lon_nhat DECIMAL(6,1) NULL DEFAULT NULL COMMENT 'mưa dồn 3 giờ lớn nhất trong 12 giờ trước lúc báo ngập',
  mua_12h DECIMAL(6,1) NULL DEFAULT NULL COMMENT 'tổng mưa 12 giờ trước lúc báo ngập',
  staff_id INT NULL DEFAULT NULL,
  KEY idx_ngap_theo_mua (hotspot_id, xac_nhan_luc),
  CONSTRAINT fk_ngap_theo_mua FOREIGN KEY (hotspot_id) REFERENCES traffic_hotspots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- KIỂM TRA: phải ra 2 dòng
SELECT table_name AS bang_moi FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('nguong_ngap_duong', 'ngap_theo_mua');
