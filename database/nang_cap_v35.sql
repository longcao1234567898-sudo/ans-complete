SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V35 — GHI LẠI TỆP ĐÍNH KÈM KHÔNG NHẬN ĐƯỢC (BUG-035)
-- ============================================================================
--
-- ⚠️ CHỌN SẴN database của web trước khi chạy (tệp không tự chọn database).
--
-- VÌ SAO: tệp người dân gửi kèm bị máy chặn (kiểm an toàn) hoặc lưu lỗi trước đây
-- bị bỏ âm thầm — người dân tưởng chứng cứ đã tới, cán bộ không biết từng có tệp.
-- Nay người dân được báo ngay lúc gửi, và bảng này giữ dấu cho cán bộ: "người gửi
-- có đính 1 tệp PDF nhưng hệ thống không nhận được — lý do". Cán bộ biết để liên
-- hệ xin lại (qua khung trao đổi) hoặc hẹn người dân mang bản giấy.
--
-- KHÔNG LƯU TÊN TỆP, KHÔNG LƯU NỘI DUNG TỆP: tên do máy người dân đặt, hay chứa họ
-- tên ("Don_Nguyen_Van_A.pdf") — tin ẩn danh mà lộ tên qua đây là hỏng lời hứa ẩn
-- danh. Tên tệp chỉ trả về cho chính trình duyệt người gửi, không ghi ở đâu cả.
--
-- Xoá hồ sơ là xoá luôn các dòng này (ON DELETE CASCADE).
--
-- TÀI KHOẢN MYSQL QUYỀN HẸP (cấp quyền từng bảng): cấp thêm cho bảng mới:
--   GRANT SELECT, INSERT ON <database>.tep_khong_nhan TO '<tài khoản>'@'<máy>';
--
-- THỜI ĐIỂM: chạy trước hay sau khi cập nhật mã đều được. Chưa chạy thì người dân
-- vẫn được báo lúc gửi, nhưng cán bộ không thấy dấu (máy chủ ghi lỗi ra log).
-- Chạy lại nhiều lần không lỗi, không đổi dữ liệu.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tep_khong_nhan (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submission_id BIGINT NOT NULL,
  bo_sung_id BIGINT NULL DEFAULT NULL COMMENT 'Lần bổ sung đã gửi kèm tệp này; NULL = gửi lúc đầu',
  loai ENUM('anh','tai_lieu') NOT NULL,
  ly_do VARCHAR(300) NOT NULL COMMENT 'Lý do không nhận — đúng câu đã báo cho người dân',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tep_khong_nhan (submission_id),
  CONSTRAINT fk_tep_khong_nhan FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- KIỂM TRA: phải ra 1 dòng
SELECT table_name AS bang_moi FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'tep_khong_nhan';
