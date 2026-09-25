-- ============================================================================
-- NÂNG CẤP V19 — KHOÁ CHỐNG SPAM TÁCH THEO LOẠI ĐƠN (ẨN DANH / CÓ TÊN)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BƯỚC 0 — CHỌN ĐÚNG CƠ SỞ DỮ LIỆU
-- ---------------------------------------------------------------------------
--
-- ⚠️ KHÔNG CÓ DÒNG NÀY THÌ BÁO LỖI "No database selected".
-- Tên cơ sở dữ liệu của đơn vị khác thì sửa dòng dưới cho khớp (xem biến
-- DB_NAME trong tệp server/.env).
USE hop_thu_an_ninh_so;

--
-- VÌ SAO (SEC-DEC-005, BUG-015):
-- Trước đây một dòng khoá áp cho MỌI loại đơn của máy/địa chỉ đó. Cán bộ đánh
-- rác một đơn CÓ TÊN là khoá luôn kênh tố giác ẨN DANH của chính người đó: tố
-- giác ẩn danh gửi sau bị chặn ngầm, nằm ở danh sách nghi rác, tạo sau giờ khoá
-- — ít máy bị khoá thì đơn đó gần như chắc chắn là của người có tên kia.
-- Chiều ngược lại cũng vậy. Nay mỗi dòng khoá nói rõ nó chặn loại đơn nào.
--
-- ⚠️ DÒNG KHOÁ CŨ NHẬN 'khong_ro' VÀ KHÔNG CHẶN ĐƠN NÀO.
-- Không biết dòng cũ do đơn loại nào gây ra. Gán 'an_danh' hay 'co_ten' đều mở
-- lại đúng đường lộ ở một chiều. Đánh đổi: máy đang bị khoá lúc chạy tệp này
-- được thả sớm (tối đa 30 ngày còn lại của khoá tái phạm). Dòng 'trusted_device'
-- cũng mang 'khong_ro' — nó không phải khoá, không cần loại.
--
-- ⚠️ CHƯA CHẠY TỆP NÀY THÌ MÁY CHỦ MỚI KHÔNG KHOÁ ĐƯỢC AI.
-- Câu kiểm/ghi khoá có cột loai_don sẽ lỗi và bị bắt lại (thà lọt tin rác còn
-- hơn chặn oan). Chạy tệp này TRƯỚC khi cập nhật mã máy chủ.
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không báo lỗi.
-- ============================================================================


-- 1. Cột loai_don
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE blacklists ADD COLUMN loai_don ENUM(''an_danh'',''co_ten'',''khong_ro'') NOT NULL DEFAULT ''khong_ro'' COMMENT ''Loại đơn mà dòng khoá chặn — khoá do đơn loại nào gây ra thì chỉ chặn loại đó'' AFTER kind',
    'SELECT ''cột loai_don đã có, bỏ qua'''
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'blacklists' AND column_name = 'loai_don'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Khoá duy nhất mới: một máy có thể bị khoá riêng từng loại.
--    Thêm khoá mới TRƯỚC rồi mới bỏ khoá cũ, để không lúc nào bảng thiếu ràng buộc.
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE blacklists ADD UNIQUE KEY uq_dinh_danh_loai (identifier, kind, loai_don)',
    'SELECT ''khoá uq_dinh_danh_loai đã có, bỏ qua'''
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'blacklists' AND index_name = 'uq_dinh_danh_loai'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE blacklists DROP INDEX uq_dinh_danh',
    'SELECT ''khoá cũ uq_dinh_danh đã bỏ, bỏ qua'''
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'blacklists' AND index_name = 'uq_dinh_danh'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Kiểm lại: phải thấy loai_don và uq_dinh_danh_loai, KHÔNG còn uq_dinh_danh
SELECT column_name, column_type, column_default
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'blacklists' AND column_name = 'loai_don';
SELECT DISTINCT index_name
  FROM information_schema.statistics
 WHERE table_schema = DATABASE() AND table_name = 'blacklists';
