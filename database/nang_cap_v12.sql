-- ============================================================================
-- NÂNG CẤP v12 — CHAT ẨN DANH 2 CHIỀU + CHẶN SPAM THEO THIẾT BỊ
-- ============================================================================
--
-- CÁCH DÙNG:
--   1. Mở HeidiSQL, BẤM CHỌN database ở cây bên trái cho nó sáng lên
--   2. Mở tab Query, dán TOÀN BỘ file này, bấm F9
--   3. Khởi động lại máy chủ trên Render
--
-- File này chạy lại nhiều lần vẫn an toàn (dùng IF NOT EXISTS và kiểm tra
-- cột trước khi thêm).
-- ============================================================================


-- ============================================================================
-- PHẦN 1 — CHAT ẨN DANH HAI CHIỀU
-- ============================================================================
--
-- VÌ SAO CẦN:
-- Bà con gửi tố giác ẩn danh xong là hết đường liên lạc. Cán bộ đọc thấy
-- thiếu thông tin — "đối tượng mặc áo màu gì", "khoảng mấy giờ" — nhưng không
-- hỏi lại được vì không có số điện thoại. Đơn đành xếp lại.
--
-- Kênh chat này giải bài toán đó mà KHÔNG phá vỡ tính ẩn danh: bảng chat chỉ
-- lưu nội dung tin nhắn và bên gửi là ai (cán bộ hay người dân). Không lưu
-- tên, số điện thoại, email hay địa chỉ IP.
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_messages (
  id            BIGINT NOT NULL AUTO_INCREMENT,

  -- ⚠️ PHẢI ĐÚNG KIỂU submissions.id là BIGINT (KHÔNG unsigned).
  -- Khai BIGINT UNSIGNED sẽ báo lỗi 3780 "Referencing column and referenced
  -- column are incompatible" — MySQL đòi hai bên khoá ngoại khớp kiểu tuyệt đối,
  -- kể cả khác nhau ở chỗ có dấu hay không.
  submission_id BIGINT NOT NULL,

  -- 'staff'    = cán bộ hỏi thêm
  -- 'reporter' = người dân trả lời
  sender_type   ENUM('staff','reporter') NOT NULL,

  -- Chỉ điền khi sender_type = 'staff'. Người dân KHÔNG có định danh nào ở đây.
  staff_id      INT NULL,

  message       TEXT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Đánh dấu bên kia đã đọc chưa, để hiện chấm đỏ báo tin mới
  read_by_staff    TINYINT(1) NOT NULL DEFAULT 0,
  read_by_reporter TINYINT(1) NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  KEY idx_submission (submission_id, created_at),
  KEY idx_chua_doc (submission_id, read_by_staff),
  CONSTRAINT fk_msg_submission FOREIGN KEY (submission_id)
    REFERENCES submissions (id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_staff FOREIGN KEY (staff_id)
    REFERENCES staff (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- MÃ PIN ĐỂ VÀO PHÒNG CHAT
--
-- VÌ SAO CẦN THÊM PIN, MÃ TRA CỨU CHƯA ĐỦ:
-- Mã tra cứu chỉ 6 ký tự và dùng để XEM tiến độ — lộ ra cũng chỉ biết đơn
-- đang ở bước nào. Nhưng phòng chat thì khác: trong đó có câu hỏi nghiệp vụ
-- của cán bộ ("đối tượng có mấy người", "xe biển số gì"), lộ ra là lộ hướng
-- điều tra, và kẻ bị tố giác có thể mạo danh người báo tin để đánh lạc hướng.
--
-- Nên vào phòng chat phải có THÊM mã PIN 6 số, cấp một lần lúc gửi đơn.
-- Database chỉ lưu bản BĂM bcrypt — kể cả quản trị viên cũng không đọc được
-- PIN gốc, đúng nguyên tắc đã áp dụng cho mật khẩu cán bộ.
-- ---------------------------------------------------------------------------

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN chat_pin_hash VARCHAR(255) NULL COMMENT ''Băm bcrypt của mã PIN vào phòng chat''',
    'SELECT ''cột chat_pin_hash đã có, bỏ qua'''
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'submissions'
    AND column_name = 'chat_pin_hash'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- PHẦN 2 — CHẶN SPAM THEO THIẾT BỊ (kèm xử lý CGNAT)
-- ============================================================================
--
-- VÌ SAO KHÔNG CHẶN THEO IP:
-- Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm, có khi hàng nghìn thuê
-- bao cùng ra Internet bằng MỘT địa chỉ IP công cộng. Khoá IP nghĩa là khoá
-- oan cả vùng thuê bao. Bà con ở quê phần lớn vào bằng 4G, đúng nhóm bị chặn
-- oan nhiều nhất, mà cũng đúng nhóm cần kênh tố giác nhất.
--
-- Nên khoá theo MÃ THIẾT BỊ do trình duyệt tự sinh và lưu trong máy.
-- IP chỉ dùng làm lớp dự phòng khi kẻ phá hoại liên tục xoá bộ nhớ trình
-- duyệt để đổi mã thiết bị.
-- ============================================================================

CREATE TABLE IF NOT EXISTS blacklists (
  id          INT NOT NULL AUTO_INCREMENT,

  -- Giá trị bị khoá: mã thiết bị (UUID) hoặc địa chỉ IP
  identifier  VARCHAR(64) NOT NULL,
  kind        ENUM('device','ip') NOT NULL,

  reason      VARCHAR(255) NULL,
  created_by  INT NULL,                    -- cán bộ nào khoá; NULL = hệ thống tự khoá
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,           -- khoá CÓ HẠN, không khoá vĩnh viễn

  PRIMARY KEY (id),
  UNIQUE KEY uq_dinh_danh (identifier, kind),
  KEY idx_con_hieu_luc (kind, identifier, expires_at),
  CONSTRAINT fk_bl_staff FOREIGN KEY (created_by)
    REFERENCES staff (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ⚠️ KHOÁ LUÔN CÓ HẠN, KHÔNG VĨNH VIỄN.
-- Mã thiết bị có thể đổi chủ: bà con dùng máy ở tiệm net, hoặc mượn điện
-- thoại người thân. Khoá vĩnh viễn là chặn oan người vô can về sau.


-- ---------------------------------------------------------------------------
-- HAI CỘT MỚI TRONG submissions
-- ---------------------------------------------------------------------------

-- device_id: mã thiết bị gửi đơn, để truy vết và khoá đúng máy phá hoại
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN device_id VARCHAR(64) NULL COMMENT ''Mã thiết bị do trình duyệt sinh, dùng chặn spam''',
    'SELECT ''cột device_id đã có, bỏ qua'''
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'device_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_spam: đánh dấu đơn bị chặn ngầm.
--
-- VÌ SAO CẦN CỘT RIÊNG, DÙNG status = 'spam' CHƯA ĐỦ:
-- Cột này phục vụ CHẶN NGẦM (shadow ban). Kẻ phá hoại vẫn thấy màn hình báo
-- "Gửi thành công" như thường, nên không biết mình bị chặn mà đổi cách phá.
-- Còn cán bộ thì không bị làm phiền vì đơn không vào hàng chờ.
-- Tách riêng khỏi status để phân biệt: status='spam' là cán bộ ĐÁNH GIÁ sau
-- khi đọc, còn is_spam=1 là hệ thống TỰ chặn ngay từ đầu.
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE submissions ADD COLUMN is_spam TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1 = bị chặn ngầm, không hiện cho cán bộ''',
    'SELECT ''cột is_spam đã có, bỏ qua'''
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND column_name = 'is_spam'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Chỉ mục cho luật dự phòng theo IP (đếm đơn rác cùng IP trong 1 giờ)
SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE submissions ADD INDEX idx_spam_ip (ip_address, is_spam, created_at)',
    'SELECT ''chỉ mục idx_spam_ip đã có, bỏ qua'''
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'submissions' AND index_name = 'idx_spam_ip'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ============================================================================
-- VIEW HỖ TRỢ
-- ============================================================================

-- Danh sách khoá còn hiệu lực — cán bộ xem và gỡ khoá khi cần
CREATE OR REPLACE VIEW vw_blacklist_active AS
SELECT b.id, b.identifier, b.kind, b.reason, b.created_at, b.expires_at,
       st.full_name AS nguoi_khoa,
       TIMESTAMPDIFF(MINUTE, NOW(), b.expires_at) AS con_lai_phut
FROM blacklists b
LEFT JOIN staff st ON st.id = b.created_by
WHERE b.expires_at > NOW()
ORDER BY b.created_at DESC;

-- Hồ sơ có tin nhắn chưa đọc — để hiện chấm đỏ trên danh sách của cán bộ
CREATE OR REPLACE VIEW vw_chat_chua_doc AS
SELECT m.submission_id,
       COUNT(*) AS so_tin_chua_doc,
       MAX(m.created_at) AS tin_moi_nhat
FROM report_messages m
WHERE m.sender_type = 'reporter' AND m.read_by_staff = 0
GROUP BY m.submission_id;


-- ============================================================================
-- KIỂM TRA SAU KHI CHẠY
-- ============================================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'report_messages')   AS bang_chat,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'blacklists')        AS bang_khoa,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'submissions'
       AND column_name IN ('chat_pin_hash','device_id','is_spam'))         AS cot_moi,
  (SELECT COUNT(*) FROM information_schema.views
     WHERE table_schema = DATABASE()
       AND table_name IN ('vw_blacklist_active','vw_chat_chua_doc'))       AS view_moi;

-- Mong đợi:  bang_chat = 1 · bang_khoa = 1 · cot_moi = 3 · view_moi = 2
