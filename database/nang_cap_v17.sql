-- ============================================================================
-- NÂNG CẤP V17 — KHIẾU NẠI MỞ KHOÁ
-- ============================================================================
--
-- Vì sao cần: hệ thống tự khoá thiết bị hoặc địa chỉ mạng khi phát hiện gửi tin
-- rác. Nhưng máy có thể khoá NHẦM — bà con dùng chung máy ở tiệm net, dùng
-- chung địa chỉ mạng do nhà mạng cấp phát (rất phổ biến với mạng di động Việt
-- Nam, nhiều thuê bao chung một địa chỉ), hoặc một người phá còn cả xóm chịu.
--
-- Không có đường khiếu nại thì người bị khoá oan mất hẳn kênh báo tin cho công
-- an mà không hiểu vì sao, cũng không biết kêu ai. Bảng này mở đường đó.
--
-- ⚠️ GIỚI HẠN 2 LẦN cho mỗi thiết bị/địa chỉ bị khoá. Không giới hạn thì chính
--    kẻ phá lại dùng khiếu nại để quấy cán bộ.
-- ============================================================================

CREATE TABLE IF NOT EXISTS unlock_appeals (
  id           INT NOT NULL AUTO_INCREMENT,

  -- Đang khiếu nại cho cái gì: mã thiết bị hay địa chỉ mạng
  identifier   VARCHAR(64) NOT NULL,
  kind         ENUM('device','ip') NOT NULL,

  -- Lời trình bày của người dân
  content      TEXT NOT NULL,

  -- Mã thiết bị ĐANG GỬI khiếu nại. Dùng để đếm số lần khiếu nại từ mỗi máy,
  -- vì người bị khoá địa chỉ mạng có thể gửi từ máy khác.
  device_id    VARCHAR(64) NULL,
  ip_address   VARCHAR(45) NULL,

  -- Trạng thái xử lý
  status       ENUM('cho_xu_ly','da_go_khoa','tu_choi') NOT NULL DEFAULT 'cho_xu_ly',
  handled_by   INT NULL,                  -- cán bộ nào quyết định
  handled_at   DATETIME NULL,
  handler_note VARCHAR(255) NULL,         -- lý do từ chối hoặc ghi chú khi gỡ

  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_dang_cho (status, created_at),
  KEY idx_theo_doi_tuong (kind, identifier),
  KEY idx_theo_thiet_bi (device_id),
  CONSTRAINT fk_appeal_staff FOREIGN KEY (handled_by)
    REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
