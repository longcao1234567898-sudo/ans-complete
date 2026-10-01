-- ============================================================================
-- NÂNG CẤP V29 — NGƯỜI DÂN BỔ SUNG THÔNG TIN TRONG 72 GIỜ (ADR-003 việc 21, 22)
-- ============================================================================
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (biến DB_NAME
-- trong server/.env).
USE hop_thu_an_ninh_so;

-- VÌ SAO:
-- Người dân bổ sung nội dung, ảnh cho tin đã gửi, trong 72 giờ tính từ lúc
-- gửi, bằng mã tra cứu + mã PIN (vé phòng trao đổi). Phần bổ sung:
--   · LƯU RIÊNG, không sửa nội dung gốc — giữ đúng điều người dân nói lúc đầu
--   · ghi thời điểm; cán bộ mở hồ sơ thì đánh dấu đã đọc (tắt chấm đỏ)
--   · số lần bổ sung mỗi tin có giới hạn, đếm ATOMIC (luật 6): mỗi lần bổ sung
--     giữ một "thứ tự" riêng, khoá duy nhất (submission_id, thu_tu) — hai yêu
--     cầu cùng lúc giành cùng một thứ tự thì CSDL chỉ cho một câu thành công
--   · ảnh bổ sung nằm chung bảng submission_images, cột bo_sung_id cho biết ảnh
--     thuộc lần bổ sung nào (NULL = ảnh gửi kèm lúc đầu)
--
-- THỜI ĐIỂM: chạy lúc nào cũng được. Mã mới chạy khi chưa có bảng thì nút bổ
-- sung báo "tạm chưa nhận bổ sung" (503), phần còn lại chạy bình thường.
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- ============================================================================

CREATE TABLE IF NOT EXISTS bo_sung_thong_tin (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT NOT NULL,
  thu_tu TINYINT UNSIGNED NOT NULL COMMENT 'Lần bổ sung thứ mấy của tin này — khoá đếm atomic',
  noi_dung TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  da_doc_luc DATETIME NULL DEFAULT NULL COMMENT 'Cán bộ mở hồ sơ lần đầu sau khi có bổ sung',
  UNIQUE KEY uq_bo_sung_thu_tu (submission_id, thu_tu),
  INDEX idx_bo_sung_chua_doc (submission_id, da_doc_luc),
  CONSTRAINT fk_bo_sung_ho_so FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE submission_images ADD COLUMN bo_sung_id BIGINT NULL DEFAULT NULL COMMENT ''Ảnh của lần bổ sung nào (NULL = gửi kèm lúc đầu)''',
    'SELECT ''cột submission_images.bo_sung_id đã có, bỏ qua''')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submission_images' AND column_name = 'bo_sung_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Kiểm tra
SELECT COUNT(*) AS so_bo_sung FROM bo_sung_thong_tin;
