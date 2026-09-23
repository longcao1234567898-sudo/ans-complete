-- ============================================================================
-- NÂNG CẤP V18 — ĐẾM LƯỢT TRUY CẬP VÀ ĐIỂM ĐEN GIAO THÔNG
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BƯỚC 0 — CHỌN ĐÚNG CƠ SỞ DỮ LIỆU
-- ---------------------------------------------------------------------------
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
--
-- HeidiSQL không tự biết chạy vào cơ sở dữ liệu nào, nên phải nói rõ. Cách
-- khác: bấm đúp vào tên cơ sở dữ liệu ở khung bên trái cho tên đậm lên, rồi
-- mới bấm F9.
--
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (xem biến
-- DB_NAME trong tệp server/.env).
USE hop_thu_an_ninh_so;

--
-- Hai bảng cho hai tính năng mới:
--   1. site_visits     — đếm lượt người dân vào trang, theo ngày
--   2. traffic_hotspots — các khu thường xảy ra tai nạn giao thông
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không báo lỗi.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. ĐẾM LƯỢT TRUY CẬP
-- ---------------------------------------------------------------------------
--
-- ⚠️ CHỈ ĐẾM SỐ, KHÔNG LƯU DẤU VẾT NGƯỜI DÙNG.
--    Bảng này gom theo NGÀY, mỗi ngày một dòng. Không lưu địa chỉ mạng, không
--    lưu mã thiết bị, không biết ai đã vào. Đây là lựa chọn có chủ đích: đây
--    là hệ thống tố giác, việc lưu dấu vết người truy cập có thể làm lộ ai đã
--    quan tâm tới việc báo tin — nguy hiểm ở địa bàn nhỏ.
--
--    Con số "khách" đếm bằng mã phiên ngẫu nhiên do trình duyệt sinh, sống
--    trong một phiên làm việc rồi mất. Không truy ngược được về người nào.

CREATE TABLE IF NOT EXISTS site_visits (
  ngay          DATE NOT NULL,
  luot_xem      INT NOT NULL DEFAULT 0   COMMENT 'Tổng lượt mở trang trong ngày',
  luot_khach    INT NOT NULL DEFAULT 0   COMMENT 'Số phiên khác nhau trong ngày',
  luot_gui      INT NOT NULL DEFAULT 0   COMMENT 'Số ý kiến gửi thành công trong ngày',
  PRIMARY KEY (ngay)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- 2. ĐIỂM ĐEN GIAO THÔNG
-- ---------------------------------------------------------------------------
--
-- Các khu thường xảy ra tai nạn, để cảnh báo bà con đi qua cẩn thận.
-- Cán bộ tự thêm, sửa, xoá ngay trên web.

CREATE TABLE IF NOT EXISTS traffic_hotspots (
  id            INT NOT NULL AUTO_INCREMENT,

  ten           VARCHAR(200) NOT NULL   COMMENT 'Tên khu, ví dụ: Ngã tư cầu Tân An',
  mo_ta         TEXT                    COMMENT 'Đặc điểm nguy hiểm, giờ hay xảy ra',

  lat           DECIMAL(10, 7)          COMMENT 'Vĩ độ — để hiện trên bản đồ',
  lng           DECIMAL(10, 7)          COMMENT 'Kinh độ',
  ward_id       INT NULL                COMMENT 'Địa bàn, để lọc theo xã/phường',

  -- Số liệu tai nạn. Kỳ thống kê do đơn vị tự đặt (thường là 12 tháng gần nhất).
  so_vu         INT NOT NULL DEFAULT 0  COMMENT 'Số vụ tai nạn trong kỳ',
  so_tu_vong    INT NOT NULL DEFAULT 0  COMMENT 'Số người tử vong trong kỳ',
  so_bi_thuong  INT NOT NULL DEFAULT 0  COMMENT 'Số người bị thương trong kỳ',
  ky_thong_ke   VARCHAR(100)            COMMENT 'Ví dụ: Từ 01/2026 đến 09/2026',

  -- Mức độ do cán bộ đánh giá, quyết định màu hiển thị trên bản đồ
  muc_do        ENUM('cao','trung_binh','thap') NOT NULL DEFAULT 'trung_binh',

  khuyen_cao    TEXT                    COMMENT 'Lời nhắc bà con khi đi qua',

  is_published  BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Tắt để ẩn khỏi trang người dân',
  created_by    INT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_hien (is_published, muc_do),
  KEY idx_dia_ban (ward_id),
  CONSTRAINT fk_hotspot_ward FOREIGN KEY (ward_id)
    REFERENCES wards(id) ON DELETE SET NULL,
  CONSTRAINT fk_hotspot_staff FOREIGN KEY (created_by)
    REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY
-- ---------------------------------------------------------------------------
SELECT 'site_visits' AS bang, COUNT(*) AS so_dong FROM site_visits
UNION ALL
SELECT 'traffic_hotspots', COUNT(*) FROM traffic_hotspots;
