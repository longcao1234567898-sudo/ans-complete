SET NAMES utf8mb4; -- đọc tệp đúng UTF-8 dù máy cài mặc định latin1 (ND-043)
-- ============================================================================
-- NÂNG CẤP V27 — NHẬT KÝ CHỈ GHI THÊM, KHÔNG SỬA XOÁ ĐƯỢC (ADR-003 việc 9)
-- ============================================================================
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (biến DB_NAME
-- trong server/.env).
USE hop_thu_an_ninh_so;

-- VÌ SAO:
-- ADR-003 cho mọi lãnh đạo xem danh tính và đọc tin tố giác mật, không còn ai
-- đứng trên để kiểm. Rủi ro đó được chấp nhận với điều kiện nhật ký (ai xem
-- danh tính, ai mở tin mật, ai xuất dữ liệu, ai mở nhật ký) KHÔNG AI SỬA XOÁ
-- ĐƯỢC. Hai chỗ hở trước bản này:
--
--   1. Không có gì chặn UPDATE / DELETE trên staff_activity_logs. Ai cầm được
--      tài khoản CSDL của ứng dụng là xoá được dòng "đã xem danh tính".
--   2. Khoá ngoại staff_id -> staff(id) để ON DELETE CASCADE: xoá một tài khoản
--      cán bộ là CSDL tự xoá luôn mọi dòng nhật ký của người đó. Trigger không
--      chặn được việc này — MySQL không chạy trigger cho thao tác dây chuyền
--      của khoá ngoại — nên phải đổi chính khoá ngoại.
--
-- SAU BẢN NÀY:
--   · UPDATE hay DELETE bất kỳ dòng nhật ký nào -> lỗi, câu lệnh không chạy.
--   · Xoá tài khoản cán bộ còn dòng nhật ký -> lỗi. Cán bộ nghỉ thì KHOÁ tài
--     khoản (staff.is_active = 0), không xoá — hệ thống vốn đã làm vậy, không
--     có chỗ nào trong mã máy chủ xoá cán bộ.
--
-- GIỚI HẠN — ghi rõ để không ai tưởng là tuyệt đối:
--   · Người có quyền DROP TRIGGER hoặc TRUNCATE (TRUNCATE không chạy trigger)
--     vẫn gỡ được. Tài khoản CSDL mà máy chủ ứng dụng dùng KHÔNG ĐƯỢC có quyền
--     TRIGGER, DROP, ALTER trên bảng này. Chỉ quản trị CSDL (root) giữ các quyền
--     đó, và việc gỡ trigger nằm ngoài ứng dụng.
--   · Tệp này cần chạy bằng root: tạo trigger khi bật binary log đòi quyền cao.
--
-- THỜI ĐIỂM: chạy lúc nào cũng được, không cần dừng máy chủ — mã máy chủ không
-- có câu nào sửa hay xoá nhật ký (bài quét nhat-ky-chi-ghi-them.test.js canh).
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì.
-- CHẠY: HeidiSQL (đăng nhập root) -> chọn đúng database -> dán toàn bộ -> F9
-- ============================================================================


-- 1. Gỡ khoá ngoại ON DELETE CASCADE cũ (tên do MySQL tự đặt, nên tra theo cột)
SET @fk = (
  SELECT k.CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
   WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'staff_activity_logs'
     AND k.COLUMN_NAME = 'staff_id' AND k.REFERENCED_TABLE_NAME = 'staff'
     AND r.DELETE_RULE <> 'RESTRICT'
   LIMIT 1
);
SET @sql = IF(@fk IS NULL,
  'SELECT ''Khoa ngoai staff_id da la RESTRICT (hoac khong co)'' AS ghi_chu',
  CONCAT('ALTER TABLE staff_activity_logs DROP FOREIGN KEY `', @fk, '`'));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 2. Khoá ngoại mới: cán bộ còn dòng nhật ký thì không xoá được
SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE staff_activity_logs ADD CONSTRAINT fk_nhat_ky_can_bo FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE RESTRICT',
    'SELECT ''Khoa ngoai fk_nhat_ky_can_bo da co'' AS ghi_chu')
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_activity_logs'
    AND COLUMN_NAME = 'staff_id' AND REFERENCED_TABLE_NAME = 'staff'
);
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- 3. Chặn sửa, chặn xoá. Thân trigger một câu nên không cần DELIMITER.
DROP TRIGGER IF EXISTS trg_nhat_ky_khong_sua;
CREATE TRIGGER trg_nhat_ky_khong_sua BEFORE UPDATE ON staff_activity_logs
  FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Nhat ky chi ghi them: khong duoc sua dong da ghi (ADR-003)';

DROP TRIGGER IF EXISTS trg_nhat_ky_khong_xoa;
CREATE TRIGGER trg_nhat_ky_khong_xoa BEFORE DELETE ON staff_activity_logs
  FOR EACH ROW SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Nhat ky chi ghi them: khong duoc xoa dong da ghi (ADR-003)';

-- 4. Kiểm tra: phải thấy HAI trigger và khoá ngoại DELETE_RULE = RESTRICT
SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING
  FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'staff_activity_logs';

SELECT r.CONSTRAINT_NAME, r.DELETE_RULE
  FROM information_schema.REFERENTIAL_CONSTRAINTS r
 WHERE r.CONSTRAINT_SCHEMA = DATABASE() AND r.TABLE_NAME = 'staff_activity_logs';
