SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V38 — XÁC MINH SỐ ĐIỆN THOẠI BẰNG MÃ GỬI QUA ZALO / SMS (P86)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- Hai bảng:
--   · ma_xac_minh_sdt — mã 6 số đã gửi. KHÔNG lưu số điện thoại (chỉ bản băm
--     HMAC như sender_phone_hash), KHÔNG lưu mã (băm scrypt như PIN phòng trao
--     đổi). Mã sống 5 phút, sai 5 lần là huỷ.
--   · dem_gioi_han — bộ đếm giới hạn dùng chung (theo số, theo mạng, trần tin
--     mỗi ngày). Đếm bằng một câu UPDATE có điều kiện (atomic, luật 6) — gửi dồn
--     song song không lọt quá trần, nên không ai làm anh mất quá số tiền trần.
--
-- Chưa chạy tệp này thì máy chủ không gửi mã (503) — gửi ý kiến vẫn bình thường.
-- Chạy lại nhiều lần không sao (IF NOT EXISTS). QUYỀN: cần quyền CREATE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ma_xac_minh_sdt (
  id          BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sdt_bam     CHAR(64) NOT NULL COMMENT 'HMAC số điện thoại (lib/crypto.js hashPhone) — không lưu số thật',
  ma_bam      VARCHAR(255) NOT NULL COMMENT 'scrypt của mã 6 số (lib/bam-pin.js) — không lưu mã thật',
  kenh        VARCHAR(20) NOT NULL COMMENT 'Kênh đã gửi: zalo | sms | thu',
  het_han     DATETIME NOT NULL,
  so_lan_sai  INT      NOT NULL DEFAULT 0,
  da_dung     TINYINT(1) NOT NULL DEFAULT 0,
  tao_luc     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ma_xac_minh_sdt (sdt_bam, da_dung, het_han)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='P86: mã xác minh số điện thoại (không lưu số, không lưu mã)';

CREATE TABLE IF NOT EXISTS dem_gioi_han (
  khoa    VARCHAR(100) NOT NULL PRIMARY KEY COMMENT 'loại:đối tượng đã băm, vd sdt-gio:<băm>, tran-ngay:2026-10-21',
  so      INT      NOT NULL DEFAULT 0,
  het_han DATETIME NOT NULL,
  KEY idx_dem_gioi_han_het_han (het_han)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='P86: bộ đếm giới hạn atomic dùng chung';
