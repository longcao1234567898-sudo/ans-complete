SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V33 — TRÍCH CHỮ TỆP ĐÍNH KÈM (OCR NỘI BỘ) ĐỂ CÁN BỘ ĐỌC VÀ TÌM (ADR-005)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO:
-- Người dân gửi kèm đơn Word, PDF, ảnh chụp giấy tờ. Cán bộ muốn đọc nhanh và tìm
-- được (biển số, tên đường, số giấy tờ) mà không phải tải từng tệp về mở. Máy chủ
-- trích chữ ra (Word đọc thẳng, PDF đọc lớp chữ, ảnh và PDF scan thì OCR — chạy
-- ngay trên máy chủ, không gửi tệp ra dịch vụ ngoài), chuẩn hoá, lưu ở đây.
--
-- MỘT DÒNG CHO MỖI TỆP (khoá duy nhất tep_id). XOÁ TỆP HAY XOÁ HỒ SƠ LÀ XOÁ LUÔN
-- CHỮ ĐÃ TRÍCH (ON DELETE CASCADE): chữ trích là bản sao nội dung tệp, không được
-- sống lâu hơn tệp gốc.
--
--   trang_thai     cho | dang_lam | xong | loi
--   ngon_ngu       ngôn ngữ OCR cán bộ chọn khi trích lại; NULL = máy tự chọn
--   ngon_ngu_dung  ngôn ngữ thật sự đã dùng (vie | eng | vie+eng)
--   phuong_phap    docx | pdf_chu | ocr_pdf | ocr_anh
--   noi_dung       chữ đã chuẩn hoá (Unicode NFC, phông .VnTime đã chuyển)
--   noi_dung_tim   bản không dấu, chữ thường — để tìm "huynh van luy" ra "Huỳnh Văn Lũy"
--   do_tin_cay     độ tin cậy OCR 0–100 (NULL với Word, PDF có lớp chữ)
--   ghi_chu        lý do lỗi, hoặc lưu ý (chỉ đọc N trang đầu...)
--
-- TÀI KHOẢN MYSQL QUYỀN HẸP: máy chủ dùng tài khoản chỉ được cấp quyền TỪNG BẢNG
-- thì cấp thêm cho bảng mới (thay tên database, tài khoản cho đúng), không thì trang
-- hồ sơ báo "chưa bật trích chữ" dù đã chạy tệp này:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON <database>.trich_chu_tep TO '<tài khoản>'@'<máy>';
--
-- THỜI ĐIỂM: chạy trước hay sau khi cập nhật mã đều được. Mã mới chạy khi chưa có
-- bảng thì trang hồ sơ báo "chưa bật trích chữ", tìm kiếm chạy như cũ.
-- Chạy lại nhiều lần không báo lỗi, không đổi dữ liệu đã có.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trich_chu_tep (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tep_id BIGINT NOT NULL COMMENT 'submission_images.id',
  submission_id BIGINT NOT NULL,
  trang_thai ENUM('cho','dang_lam','xong','loi') NOT NULL DEFAULT 'cho',
  ngon_ngu VARCHAR(10) NULL DEFAULT NULL,
  ngon_ngu_dung VARCHAR(10) NULL DEFAULT NULL,
  phuong_phap VARCHAR(20) NULL DEFAULT NULL,
  noi_dung MEDIUMTEXT NULL,
  noi_dung_tim MEDIUMTEXT NULL,
  do_tin_cay TINYINT UNSIGNED NULL DEFAULT NULL,
  so_trang INT NULL DEFAULT NULL,
  da_chuyen_tcvn3 TINYINT(1) NOT NULL DEFAULT 0,
  ghi_chu VARCHAR(500) NULL DEFAULT NULL,
  yeu_cau_boi INT NULL DEFAULT NULL COMMENT 'cán bộ yêu cầu trích lần cuối',
  tao_luc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cap_nhat_luc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trich_chu_tep (tep_id),
  KEY idx_trich_chu_ho_so (submission_id),
  KEY idx_trich_chu_hang_doi (trang_thai, id),
  CONSTRAINT fk_trich_chu_tep FOREIGN KEY (tep_id) REFERENCES submission_images(id) ON DELETE CASCADE,
  CONSTRAINT fk_trich_chu_ho_so FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- KIỂM TRA: phải ra 1 dòng trich_chu_tep
SELECT table_name AS bang_moi FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'trich_chu_tep';
