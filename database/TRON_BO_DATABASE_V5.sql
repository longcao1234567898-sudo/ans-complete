-- =====================================================================
-- HỘP THƯ AN NINH SỐ — DATABASE TRỌN BỘ V5 (BẢN HOÀN CHỈNH NHẤT)
-- Công an thị xã Tân Châu, tỉnh An Giang | MySQL 8.0+ / MariaDB 10.4+
--
-- MỘT FILE DUY NHẤT = bản gốc + V2 + V3 + V4 + V5 + 12 tin tức mới:
--   • 10 bảng + trigger + procedure + view + dữ liệu mẫu       (gốc)
--   • Mã hoá danh tính, SLA, bản đồ, nhật ký, phân công        (V2)
--   • OTP email, ảnh Cloudinary                                 (V3)
--   • Gửi ẩn danh                                               (V4)
--   • Hàng chờ kiểm duyệt tin ẩn danh                           (V5)
--   • 12 tin tức thật tháng 7/2026 (có ảnh + link bài viết)
--
-- ⚠️ DÙNG CHO DATABASE MỚI TINH — CHẠY ĐÚNG 1 LẦN.
--    (Database đang chạy đã nâng cấp lẻ tẻ rồi thì KHÔNG chạy file này —
--     các lệnh ALTER sẽ báo "Duplicate column". Cứ dùng các file nâng cấp lẻ.)
--
-- CÁCH CHẠY (HeidiSQL):
--   1. Kết nối MySQL (Aiven/Railway/XAMPP đều được)
--   2. File -> Load SQL file -> chọn file này -> F9
--   3. CHỜ CHẠY XONG HẲN (30-60 giây)
--   4. Kiểm tra cuối file tự chạy — xem bảng kết quả
--
-- NẾU NHÀ CUNG CẤP KHÔNG CHO TẠO DATABASE (lỗi ngay dòng CREATE DATABASE):
--   -> Xoá 3 dòng CREATE DATABASE + USE đầu tiên, chọn sẵn database họ cấp,
--      và đặt DB_NAME trên Render đúng tên đó.
--
-- SAU KHI CHẠY XONG:
--   cd server
--   node scripts-them-can-bo.js admin MatKhau@2026 "Quản trị viên" admin
-- =====================================================================



-- ╔════════════════════════════════════════════╗
-- ║  PHẦN 1/6 — BẢN GỐC: 10 bảng + dữ liệu mẫu
-- ╚════════════════════════════════════════════╝

-- ============================================================
-- HỘP THƯ AN NINH SỐ — Database đầy đủ
-- Công an thị xã Tân Châu, tỉnh An Giang  |  MySQL 8.0+ / MariaDB 10.4+
--
-- File này tạo TOÀN BỘ: 10 bảng + dữ liệu mẫu + trigger + procedure + view.
-- Chạy được nhiều lần, không lỗi "table already exists".
--
-- DÙNG CHO NHÀ CUNG CẤP NÀO CŨNG ĐƯỢC (Aiven, Railway, XAMPP, Clever Cloud...)
--
-- CÁCH CHẠY (HeidiSQL — khuyên dùng):
--   1. Kết nối tới MySQL của bạn
--   2. File -> Load SQL file -> chọn file này
--   3. Bấm F9, CHỜ CHẠY XONG HẲN (đừng tắt giữa chừng)
--   4. Kiểm tra:  SELECT COUNT(*) FROM banned_words;   -> phải ra 26
--
-- ⚠️ NẾU NHÀ CUNG CẤP KHÔNG CHO TẠO DATABASE MỚI
--    (báo lỗi ở dòng CREATE DATABASE / USE — thường gặp ở gói free hạn chế):
--    -> Xoá 3 dòng CREATE DATABASE + USE bên dưới,
--       rồi chọn sẵn database họ cấp cho bạn trước khi bấm F9.
--    -> Nhớ đặt DB_NAME trên Render đúng bằng tên database đó.
--
-- SAU KHI CHẠY XONG, ĐỪNG QUÊN tạo mật khẩu admin:
--    cd server
--    node scripts-create-admin.js MatKhauCuaBan@2026
-- ============================================================

CREATE DATABASE IF NOT EXISTS hop_thu_an_ninh_so
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hop_thu_an_ninh_so;

SET FOREIGN_KEY_CHECKS = 0;

DROP TRIGGER IF EXISTS trg_submission_received;
DROP VIEW IF EXISTS vw_dashboard_stats;
DROP VIEW IF EXISTS vw_category_stats;
DROP VIEW IF EXISTS vw_resolution_performance;
DROP PROCEDURE IF EXISTS update_submission_status;
DROP PROCEDURE IF EXISTS get_submission_by_tracking;
DROP PROCEDURE IF EXISTS check_spam;
DROP FUNCTION IF EXISTS generate_tracking_code;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS staff_activity_logs;
DROP TABLE IF EXISTS status_history;
DROP TABLE IF EXISTS submission_images;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS banned_words;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS news;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS categories;

-- 1. categories
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. staff
CREATE TABLE staff (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    role ENUM('admin','manager','handler') DEFAULT 'handler',
    assigned_category_id INT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. submissions
CREATE TABLE submissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tracking_code CHAR(6) NOT NULL UNIQUE,
    original_content TEXT NOT NULL,
    ai_processed_content TEXT,
    ai_confidence DECIMAL(4,3),
    ai_keywords JSON,
    content_hash CHAR(64),
    category_id INT,
    ai_suggested_category_id INT,
    sender_name VARCHAR(100) NOT NULL,
    sender_phone VARCHAR(20) NOT NULL,
    sender_email VARCHAR(100),
    status ENUM('received','processing','resolved','rejected') DEFAULT 'received',
    rejection_reason TEXT,
    assigned_to INT,
    resolution_note TEXT,
    resolved_by INT,
    resolved_at DATETIME,
    is_flagged BOOLEAN DEFAULT FALSE,
    flag_reason VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (ai_suggested_category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_tracking_code (tracking_code),
    INDEX idx_status (status),
    INDEX idx_category (category_id),
    INDEX idx_created_at (created_at),
    INDEX idx_content_hash (content_hash),
    INDEX idx_ip_created (ip_address, created_at),
    INDEX idx_phone_created (sender_phone, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. submission_images
CREATE TABLE submission_images (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    submission_id BIGINT NOT NULL,
    image_url LONGTEXT NOT NULL COMMENT 'Ảnh base64 (data URL) - phải LONGTEXT vì rất dài',
    original_name VARCHAR(255),
    file_size INT,
    mime_type VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    moderation_status ENUM('safe','suspicious','blocked') DEFAULT 'safe',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    INDEX idx_submission (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. status_history
CREATE TABLE status_history (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    submission_id BIGINT NOT NULL,
    old_status ENUM('received','processing','resolved','rejected'),
    new_status ENUM('received','processing','resolved','rejected') NOT NULL,
    note TEXT,
    changed_by INT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_submission (submission_id),
    INDEX idx_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. news
CREATE TABLE news (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    content LONGTEXT,
    category ENUM('security','warning','guide','document') NOT NULL,
    image_url VARCHAR(500),
    source_name VARCHAR(100),
    source_url VARCHAR(500),
    is_external BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT TRUE,
    published_at DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_published_at (published_at),
    INDEX idx_is_published (is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. staff_activity_logs
CREATE TABLE staff_activity_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    staff_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id BIGINT,
    details JSON,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    INDEX idx_staff (staff_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. system_settings
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    `key` VARCHAR(100) NOT NULL UNIQUE,
    `value` TEXT,
    description VARCHAR(255),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. banned_words
CREATE TABLE banned_words (
    id INT PRIMARY KEY AUTO_INCREMENT,
    word VARCHAR(100) NOT NULL UNIQUE,
    word_type ENUM('phrase','token') NOT NULL DEFAULT 'phrase',
    is_active BOOLEAN DEFAULT TRUE,
    added_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES staff(id) ON DELETE SET NULL,
    INDEX idx_word_type (word_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. refresh_tokens — phiên đăng nhập cán bộ (JWT refresh)
CREATE TABLE refresh_tokens (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    staff_id    INT NOT NULL,
    token_hash  CHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 của refresh token (không lưu token thô)',
    revoked     BOOLEAN DEFAULT FALSE,
    expires_at  DATETIME NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    INDEX idx_token_hash (token_hash),
    INDEX idx_staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================= DỮ LIỆU MẶC ĐỊNH =================
INSERT INTO categories (id, code, name, description, display_order) VALUES
(1, 'to_giac',   'Tố giác tin báo',     'Tố giác tội phạm, tin báo về hành vi vi phạm pháp luật', 1),
(2, 'khieu_nai', 'Khiếu nại, tố cáo',   'Khiếu nại quyết định hành chính, tố cáo cán bộ vi phạm', 2),
(3, 'phan_anh',  'Phản ánh, kiến nghị', 'Phản ánh về an ninh trật tự, kiến nghị cải thiện', 3),
(4, 'de_xuat',   'Đề xuất, thắc mắc',   'Đề xuất giải pháp, thắc mắc về thủ tục hành chính', 4);

INSERT INTO staff (id, full_name, username, password_hash, email, role) VALUES
(1, 'Quản trị hệ thống', 'admin', '$2b$12$PLACEHOLDER_DOI_NGAY_TRUOC_KHI_SU_DUNG_THAT', 'congan.tanchau@angiang.gov.vn', 'admin');

INSERT INTO system_settings (`key`, `value`, description) VALUES
('site_name', 'Hộp Thư An Ninh Số', 'Tên hệ thống'),
('site_unit', 'Công an thị xã Tân Châu', 'Tên đơn vị'),
('site_address', 'Số 16 Phạm Hùng, khóm Long Thị D, phường Long Thạnh, thị xã Tân Châu, tỉnh An Giang', 'Địa chỉ'),
('site_phone', '0296 3822 154', 'Điện thoại trực ban'),
('site_emergency_phone', '113', 'Điện thoại khẩn cấp'),
('site_email', 'congan.tanchau@angiang.gov.vn', 'Email liên hệ'),
('site_facebook', 'https://www.facebook.com/conganthixatanchauangiang', 'Fanpage Facebook'),
('site_working_hours', 'Thứ 2 - Thứ 6: 7:30-12:00, 13:30-17:00 (trực ban 24/24)', 'Giờ làm việc'),
('max_images_per_submission', '3', 'Số ảnh tối đa mỗi ý kiến'),
('max_content_length', '2000', 'Số ký tự tối đa nội dung'),
('max_image_size_mb', '8', 'Kích thước ảnh tối đa (MB)'),
('tracking_code_length', '6', 'Độ dài mã tra cứu'),
('spam_cooldown_seconds', '120', 'Giây chờ giữa 2 lần gửi'),
('spam_max_per_hour', '5', 'Số ý kiến tối đa mỗi giờ'),
('auto_assign_enabled', 'true', 'Tự động phân công'),
('notification_email_enabled', 'true', 'Bật thông báo email');

INSERT INTO banned_words (word, word_type) VALUES
('đụ','phrase'),('địt','phrase'),('đéo','phrase'),('cặc','phrase'),('lồn','phrase'),
('buồi','phrase'),('đĩ','phrase'),('óc chó','phrase'),('chó đẻ','phrase'),('mẹ mày','phrase'),
('khốn nạn','phrase'),('mất dạy','phrase'),('súc vật','phrase'),('fuck','phrase'),('shit','phrase'),('bitch','phrase'),
('dm','token'),('dmm','token'),('dcm','token'),('vcl','token'),('vkl','token'),
('clgt','token'),('loz','token'),('djt','token'),('cc','token'),('wtf','token');

INSERT INTO news (title, summary, category, image_url, source_name, source_url, published_at) VALUES
('Công an thị xã Tân Châu ra quân cao điểm bảo đảm ANTT tuyến biên giới Vĩnh Xương',
 'Lực lượng Công an thị xã phối hợp Đồn Biên phòng cửa khẩu quốc tế Vĩnh Xương tuần tra khép kín tuyến biên giới, phòng chống buôn lậu, xuất nhập cảnh trái phép và tội phạm ma tuý.',
 'security', NULL, 'congan.angiang.gov.vn', 'https://congan.angiang.gov.vn', CURDATE() - INTERVAL 1 DAY),
('Tuần tra đêm khép kín địa bàn các phường Long Thạnh, Long Châu, Long Phú',
 'Tổ tuần tra 161 Công an thị xã Tân Châu duy trì tuần tra vũ trang ban đêm, kịp thời phát hiện, ngăn chặn các nhóm thanh thiếu niên tụ tập gây rối trật tự công cộng.',
 'security', NULL, 'Fanpage Công an TX Tân Châu', 'https://www.facebook.com/conganthixatanchauangiang', CURDATE() - INTERVAL 3 DAY),
('Cảnh giác chiêu trò việc nhẹ lương cao dụ dỗ xuất cảnh trái phép sang Campuchia',
 'Địa bàn biên giới Tân Châu là điểm nóng của thủ đoạn lôi kéo lao động vượt biên rồi cưỡng bức làm việc trong các cơ sở lừa đảo trực tuyến. Người dân tuyệt đối không tin lời mời chào trên mạng xã hội.',
 'warning', NULL, 'bocongan.gov.vn', 'https://bocongan.gov.vn', CURDATE() - INTERVAL 4 DAY),
('Giả danh công an gọi điện yêu cầu cài ứng dụng, chuyển tiền - thủ đoạn cũ, nạn nhân mới',
 'Đối tượng mạo danh cán bộ điều tra đe doạ nạn nhân liên quan vụ án rồi yêu cầu chuyển tiền vào tài khoản tạm giữ. Công an không bao giờ làm việc qua điện thoại kèm yêu cầu chuyển tiền, đọc mã OTP.',
 'warning', NULL, 'luatvietnam.vn', 'https://luatvietnam.vn', CURDATE() - INTERVAL 6 DAY),
('Hướng dẫn đăng ký cư trú trực tuyến trên ứng dụng VNeID',
 'Từng bước khai báo tạm trú, tạm vắng ngay trên điện thoại: chuẩn bị giấy tờ, điền tờ khai điện tử, theo dõi kết quả - không cần đến trụ sở công an.',
 'guide', NULL, 'dichvucong.gov.vn', 'https://dichvucong.gov.vn', CURDATE() - INTERVAL 8 DAY),
('Công an Tân Châu cấp căn cước lưu động cho người già yếu, bệnh tật tại nhà',
 'Tổ công tác mang thiết bị thu nhận sinh trắc học đến tận nhà phục vụ người cao tuổi, người khuyết tật trên địa bàn các phường, xã - bảo đảm không ai bị bỏ lại phía sau trong Đề án 06.',
 'guide', NULL, 'congan.angiang.gov.vn', 'https://congan.angiang.gov.vn', CURDATE() - INTERVAL 10 DAY),
('Nghị quyết 57-NQ/TW: đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia',
 'Bộ Chính trị xác định khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số là đột phá quan trọng hàng đầu - nền tảng để hiện đại hoá quản trị quốc gia, trong đó có chuyển đổi số ngành Công an.',
 'document', NULL, 'xaydungchinhsach.chinhphu.vn', 'https://xaydungchinhsach.chinhphu.vn', CURDATE() - INTERVAL 12 DAY),
('Nghị quyết 66-NQ/TW về đổi mới công tác xây dựng và thi hành pháp luật trong kỷ nguyên mới',
 'Hoàn thiện thể chế, đưa pháp luật đi vào cuộc sống - cơ sở chính trị quan trọng để các mô hình tiếp nhận ý kiến công dân như Hộp Thư An Ninh Số hoạt động minh bạch, đúng quy định.',
 'document', NULL, 'vbpl.vn', 'https://vbpl.vn', CURDATE() - INTERVAL 15 DAY);

INSERT INTO submissions
    (id, tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
     sender_name, sender_phone, status, rejection_reason, created_at) VALUES
(1, 'DEMO01', 'khu dan cu ban dem on ao qua',
 'Phản ánh về tình hình: Tụ tập gây ồn ào ban đêm tại khóm Long Thị D, phường Long Thạnh.',
 3, 3, 'Nguyễn Văn Demo', '0909123456', 'received', NULL, NOW() - INTERVAL 2 HOUR),
(2, 'DEMO02', 'co nguoi danh nhau gan ben pha tan chau',
 'Tố giác/tin báo về vụ việc: Có người đánh nhau gần bến phà Tân Châu.',
 1, 1, 'Trần Thị Demo', '0387654321', 'processing', NULL, NOW() - INTERVAL 26 HOUR),
(3, 'DEMO03', 'hoi thu tuc dang ky tam tru cho nguoi thue tro',
 'Đề xuất/thắc mắc về nội dung: Hỏi thủ tục đăng ký tạm trú cho người thuê trọ.',
 4, 4, 'Lê Văn Demo', '0912345679', 'resolved', NULL, NOW() - INTERVAL 80 HOUR),
(4, 'DEMO04', 'tranh chap ranh gioi dat giua hai ho lien ke',
 'Khiếu nại/tố cáo về nội dung: Tranh chấp ranh giới đất giữa hai hộ liền kề.',
 2, 2, 'Phạm Thị Demo', '0798765432', 'rejected',
 'Nội dung tranh chấp đất đai không thuộc thẩm quyền giải quyết của Công an cấp xã. Đã hướng dẫn công dân gửi đơn đến UBND để được thụ lý theo quy định.',
 NOW() - INTERVAL 100 HOUR);

INSERT INTO status_history (submission_id, old_status, new_status, note, changed_at) VALUES
(1, NULL, 'received', 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu.', NOW() - INTERVAL 2 HOUR),
(2, NULL, 'received', 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu.', NOW() - INTERVAL 26 HOUR),
(2, 'received', 'processing', 'Cán bộ phụ trách đã tiếp nhận và đang xác minh.', NOW() - INTERVAL 22 HOUR),
(3, NULL, 'received', 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu.', NOW() - INTERVAL 80 HOUR),
(3, 'received', 'processing', 'Cán bộ phụ trách đã tiếp nhận và đang xác minh.', NOW() - INTERVAL 76 HOUR),
(3, 'processing', 'resolved', 'Vụ việc đã được giải quyết. Kết quả đã gửi đến công dân qua thông tin liên hệ.', NOW() - INTERVAL 50 HOUR),
(4, NULL, 'received', 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu.', NOW() - INTERVAL 100 HOUR),
(4, 'received', 'processing', 'Cán bộ phụ trách đã tiếp nhận và đang xác minh.', NOW() - INTERVAL 96 HOUR),
(4, 'processing', 'rejected', 'Không thuộc thẩm quyền giải quyết của Công an cấp xã.', NOW() - INTERVAL 70 HOUR);

SET FOREIGN_KEY_CHECKS = 1;

-- ================= TRIGGER / FUNCTION / PROCEDURE (cần DELIMITER) =================
DELIMITER //

CREATE TRIGGER trg_submission_received
AFTER INSERT ON submissions
FOR EACH ROW
BEGIN
    INSERT INTO status_history (submission_id, old_status, new_status, note)
    VALUES (NEW.id, NULL, 'received', 'Hệ thống đã ghi nhận ý kiến và cấp mã tra cứu.');
END //

CREATE FUNCTION generate_tracking_code()
RETURNS CHAR(6)
READS SQL DATA
BEGIN
    DECLARE charset VARCHAR(31) DEFAULT 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    DECLARE code CHAR(6);
    DECLARE i INT;
    DECLARE dup INT DEFAULT 1;
    WHILE dup > 0 DO
        SET code = '';
        SET i = 0;
        WHILE i < 6 DO
            SET code = CONCAT(code, SUBSTRING(charset, FLOOR(1 + RAND() * 31), 1));
            SET i = i + 1;
        END WHILE;
        SELECT COUNT(*) INTO dup FROM submissions WHERE tracking_code = code;
    END WHILE;
    RETURN code;
END //

CREATE PROCEDURE update_submission_status(
    IN p_submission_id BIGINT,
    IN p_new_status ENUM('received','processing','resolved','rejected'),
    IN p_note TEXT,
    IN p_rejection_reason TEXT,
    IN p_staff_id INT
)
BEGIN
    DECLARE v_old_status ENUM('received','processing','resolved','rejected');
    SELECT status INTO v_old_status FROM submissions WHERE id = p_submission_id;
    UPDATE submissions
    SET status = p_new_status,
        rejection_reason = CASE WHEN p_new_status = 'rejected' THEN p_rejection_reason ELSE rejection_reason END,
        resolved_by = CASE WHEN p_new_status IN ('resolved','rejected') THEN p_staff_id ELSE resolved_by END,
        resolved_at = CASE WHEN p_new_status IN ('resolved','rejected') THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = p_submission_id;
    INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by)
    VALUES (p_submission_id, v_old_status, p_new_status,
            CASE WHEN p_new_status = 'rejected' THEN COALESCE(p_rejection_reason, p_note) ELSE p_note END,
            p_staff_id);
    INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details)
    VALUES (p_staff_id, 'update_status', 'submission', p_submission_id,
            JSON_OBJECT('old_status', v_old_status, 'new_status', p_new_status));
END //

CREATE PROCEDURE get_submission_by_tracking(IN p_tracking_code CHAR(6))
BEGIN
    SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
           c.code AS category_code, c.name AS category_name,
           s.status, s.rejection_reason, s.resolution_note, s.created_at, s.updated_at,
           TIMESTAMPDIFF(HOUR, s.created_at, NOW()) AS hours_since_submitted
    FROM submissions s LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.tracking_code = UPPER(p_tracking_code);
    SELECT h.old_status, h.new_status, h.note, h.changed_at
    FROM status_history h JOIN submissions s ON s.id = h.submission_id
    WHERE s.tracking_code = UPPER(p_tracking_code) ORDER BY h.changed_at ASC;
    SELECT i.image_url, i.mime_type, i.moderation_status, i.uploaded_at
    FROM submission_images i JOIN submissions s ON s.id = i.submission_id
    WHERE s.tracking_code = UPPER(p_tracking_code) AND i.moderation_status <> 'blocked';
END //

CREATE PROCEDURE check_spam(IN p_ip VARCHAR(45), IN p_phone VARCHAR(20), IN p_content_hash CHAR(64))
BEGIN
    SELECT COUNT(*) AS submissions_last_hour,
           MAX(created_at) AS last_submission_at,
           TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) AS seconds_since_last,
           EXISTS(SELECT 1 FROM submissions
                  WHERE content_hash = p_content_hash AND created_at > NOW() - INTERVAL 1 HOUR) AS is_duplicate_content
    FROM submissions
    WHERE (ip_address = p_ip OR sender_phone = p_phone) AND created_at > NOW() - INTERVAL 1 HOUR;
END //

DELIMITER ;

-- ================= VIEWS thống kê =================
CREATE VIEW vw_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM submissions) AS total_submissions,
    (SELECT COUNT(*) FROM submissions WHERE status = 'received') AS pending_count,
    (SELECT COUNT(*) FROM submissions WHERE status = 'processing') AS processing_count,
    (SELECT COUNT(*) FROM submissions WHERE status = 'resolved') AS resolved_count,
    (SELECT COUNT(*) FROM submissions WHERE status = 'rejected') AS rejected_count,
    (SELECT COUNT(*) FROM submissions WHERE is_flagged = TRUE) AS flagged_count,
    (SELECT COUNT(*) FROM submissions WHERE DATE(created_at) = CURDATE()) AS today_count,
    (SELECT COUNT(*) FROM staff WHERE is_active = TRUE) AS active_staff_count;

CREATE VIEW vw_category_stats AS
SELECT c.id, c.code, c.name,
    COUNT(s.id) AS total_count,
    SUM(CASE WHEN s.status = 'received' THEN 1 ELSE 0 END) AS received_count,
    SUM(CASE WHEN s.status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
    SUM(CASE WHEN s.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
    SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
FROM categories c LEFT JOIN submissions s ON c.id = s.category_id
GROUP BY c.id, c.code, c.name;

CREATE VIEW vw_resolution_performance AS
SELECT c.name AS category_name,
    COUNT(s.id) AS resolved_total,
    ROUND(AVG(TIMESTAMPDIFF(HOUR, s.created_at, s.resolved_at)), 1) AS avg_resolve_hours,
    MAX(TIMESTAMPDIFF(HOUR, s.created_at, s.resolved_at)) AS max_resolve_hours
FROM submissions s JOIN categories c ON c.id = s.category_id
WHERE s.status = 'resolved' AND s.resolved_at IS NOT NULL
GROUP BY c.id, c.name;


-- ╔════════════════════════════════════════════╗
-- ║  PHẦN 2/6 — V2: mã hoá, SLA, bản đồ, nhật ký
-- ╚════════════════════════════════════════════╝

-- =====================================================================
-- NÂNG CẤP V2 — Hộp Thư An Ninh Số
-- Thêm: Mã hoá danh tính · SLA hạn xử lý · Phân công cán bộ · Địa bàn (bản đồ)
--
-- CÁCH CHẠY: HeidiSQL -> chọn database hop_thu_an_ninh_so
--            -> File -> Load SQL file -> chọn file này -> F9
--
-- AN TOÀN: KHÔNG mất dữ liệu. Chỉ thêm cột và bảng mới.
--          Chạy được nhiều lần (có IF NOT EXISTS / bỏ qua lỗi trùng).
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- 1) SLA — hạn xử lý theo từng nhóm (căn cứ quy định pháp luật)
-- ---------------------------------------------------------------
ALTER TABLE categories
    ADD COLUMN sla_days INT NOT NULL DEFAULT 15
    COMMENT 'Số ngày phải giải quyết theo quy định';

UPDATE categories SET sla_days = 20 WHERE code = 'to_giac';    -- Tố giác tội phạm: 20 ngày (BLTTHS)
UPDATE categories SET sla_days = 30 WHERE code = 'khieu_nai';  -- Khiếu nại, tố cáo: 30 ngày (Luật Khiếu nại)
UPDATE categories SET sla_days = 15 WHERE code = 'phan_anh';   -- Phản ánh, kiến nghị: 15 ngày
UPDATE categories SET sla_days = 10 WHERE code = 'de_xuat';    -- Đề xuất, thắc mắc: 10 ngày

-- ---------------------------------------------------------------
-- 2) ĐỊA BÀN — phục vụ bản đồ điểm nóng
--    ⚠️ Toạ độ dưới đây là GẦN ĐÚNG. Có thể chỉnh lại cho chính xác:
--       UPDATE wards SET lat=..., lng=... WHERE name='...';
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wards (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    lat DECIMAL(10,7) NOT NULL,
    lng DECIMAL(10,7) NOT NULL,
    display_order INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO wards (name, lat, lng, display_order) VALUES
('Phường Long Thạnh',  10.8000000, 105.2430000, 1),
('Phường Long Hưng',   10.8080000, 105.2380000, 2),
('Phường Long Châu',   10.7950000, 105.2350000, 3),
('Phường Long Phú',    10.7890000, 105.2470000, 4),
('Phường Long Sơn',    10.7820000, 105.2300000, 5),
('Xã Tân An',          10.8360000, 105.2160000, 6),
('Xã Tân Thạnh',       10.8550000, 105.1960000, 7),
('Xã Long An',         10.7700000, 105.2120000, 8),
('Xã Châu Phong',      10.7520000, 105.2570000, 9),
('Xã Phú Vĩnh',        10.7600000, 105.1900000, 10),
('Xã Vĩnh Hoà',        10.8260000, 105.1800000, 11),
('Xã Vĩnh Xương',      10.9000000, 105.1550000, 12),
('Xã Phú Lộc',         10.8780000, 105.1700000, 13),
('Xã Lê Chánh',        10.7400000, 105.2350000, 14);

-- ---------------------------------------------------------------
-- 3) SUBMISSIONS — thêm cột mới
-- ---------------------------------------------------------------

-- Nới cột danh tính để chứa chuỗi ĐÃ MÃ HOÁ (dài hơn bản gốc nhiều)
ALTER TABLE submissions
    MODIFY sender_name  VARCHAR(255) NOT NULL COMMENT 'Đã mã hoá AES-256-GCM',
    MODIFY sender_phone VARCHAR(255) NOT NULL COMMENT 'Đã mã hoá AES-256-GCM',
    MODIFY sender_email VARCHAR(255) NULL     COMMENT 'Đã mã hoá AES-256-GCM';

-- Băm SĐT để CHỐNG SPAM (vì SĐT đã mã hoá, không so sánh trực tiếp được)
ALTER TABLE submissions
    ADD COLUMN sender_phone_hash CHAR(64) NULL
    COMMENT 'SHA-256 của SĐT — dùng dò spam, không lộ số thật';

-- Hạn xử lý (SLA) — backend tự tính khi tiếp nhận
ALTER TABLE submissions
    ADD COLUMN deadline_at DATETIME NULL COMMENT 'Hạn phải giải quyết';

-- Địa bàn xảy ra vụ việc
ALTER TABLE submissions
    ADD COLUMN ward_id INT NULL;

-- Chỉ mục
ALTER TABLE submissions ADD INDEX idx_phone_hash (sender_phone_hash, created_at);
ALTER TABLE submissions ADD INDEX idx_deadline (deadline_at, status);
ALTER TABLE submissions ADD INDEX idx_ward (ward_id);
ALTER TABLE submissions ADD INDEX idx_assigned (assigned_to, status);

ALTER TABLE submissions
    ADD CONSTRAINT fk_submission_ward
    FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- 4) Gán hạn xử lý + địa bàn cho 4 ý kiến DEMO (để có dữ liệu xem thử)
-- ---------------------------------------------------------------
UPDATE submissions s
JOIN categories c ON c.id = s.category_id
SET s.deadline_at = DATE_ADD(s.created_at, INTERVAL c.sla_days DAY)
WHERE s.deadline_at IS NULL;

-- Ép DEMO02 thành QUÁ HẠN để bạn nhìn thấy cảnh báo đỏ ngay
UPDATE submissions SET deadline_at = NOW() - INTERVAL 2 DAY
WHERE tracking_code = 'DEMO02';

UPDATE submissions SET ward_id = 1 WHERE tracking_code = 'DEMO01';
UPDATE submissions SET ward_id = 4 WHERE tracking_code = 'DEMO02';
UPDATE submissions SET ward_id = 2 WHERE tracking_code = 'DEMO03';
UPDATE submissions SET ward_id = 9 WHERE tracking_code = 'DEMO04';

-- ---------------------------------------------------------------
-- 5) VIEW mới: thống kê quá hạn
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS vw_sla_stats;
CREATE VIEW vw_sla_stats AS
SELECT
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL AND deadline_at < NOW())                       AS overdue_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL
        AND deadline_at >= NOW()
        AND deadline_at < NOW() + INTERVAL 3 DAY)                                  AS near_due_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing') AND assigned_to IS NULL)           AS unassigned_count;

-- ---------------------------------------------------------------
-- KIỂM TRA — chạy xong phải ra kết quả
-- ---------------------------------------------------------------
SELECT COUNT(*) AS 'So dia ban (phai la 14)' FROM wards;
SELECT code, name, sla_days FROM categories ORDER BY display_order;
SELECT * FROM vw_sla_stats;


-- ╔════════════════════════════════════════════╗
-- ║  PHẦN 3/6 — V3: OTP email + Cloudinary
-- ╚════════════════════════════════════════════╝

-- =====================================================================
-- NÂNG CẤP V3 — Hộp Thư An Ninh Số
-- Thêm: XÁC THỰC OTP qua email · Chuyển ảnh sang CLOUDINARY
--
-- CÁCH CHẠY: HeidiSQL -> chọn database hop_thu_an_ninh_so
--            -> File -> Load SQL file -> chọn file này -> F9
--
-- AN TOÀN: KHÔNG mất dữ liệu. Chỉ thêm 1 bảng và vài cột.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- 1) BẢNG MÃ OTP — xác thực email công dân trước khi gửi ý kiến
--    Bảo mật: KHÔNG lưu email thật (chỉ băm), KHÔNG lưu mã thật (chỉ băm)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    email_hash   CHAR(64) NOT NULL      COMMENT 'SHA-256 của email',
    code_hash    VARCHAR(255) NOT NULL  COMMENT 'Mã OTP đã băm bcrypt',

    attempts     INT DEFAULT 0          COMMENT 'Nhập sai quá 5 lần thì huỷ mã',
    is_used      BOOLEAN DEFAULT FALSE,

    expires_at   DATETIME NOT NULL      COMMENT 'Hết hạn sau 10 phút',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address   VARCHAR(45),

    INDEX idx_email_hash (email_hash, is_used, expires_at),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- 2) SUBMISSIONS — đánh dấu ý kiến đã xác thực OTP
-- ---------------------------------------------------------------
ALTER TABLE submissions
    ADD COLUMN is_verified_otp BOOLEAN DEFAULT FALSE
    COMMENT 'Người gửi đã xác thực email qua OTP';

-- ---------------------------------------------------------------
-- 3) ẢNH — chuyển sang lưu ĐƯỜNG LINK Cloudinary thay vì base64
--    (LONGTEXT vẫn giữ để tương thích ảnh cũ đã lưu base64)
-- ---------------------------------------------------------------
ALTER TABLE submission_images
    ADD COLUMN cloudinary_id VARCHAR(255) NULL
    COMMENT 'ID ảnh trên Cloudinary — dùng để xoá ảnh khi cần';

ALTER TABLE submission_images
    ADD COLUMN storage ENUM('base64','cloudinary') DEFAULT 'base64'
    COMMENT 'Ảnh đang lưu ở đâu';

-- Đánh dấu ảnh cũ (base64) để phân biệt
UPDATE submission_images SET storage = 'base64' WHERE storage IS NULL;

-- ---------------------------------------------------------------
-- 4) Dọn mã OTP hết hạn (chạy định kỳ khi cần)
-- ---------------------------------------------------------------
-- DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL 1 DAY;

-- ---------------------------------------------------------------
-- KIỂM TRA — chạy xong phải ra kết quả
-- ---------------------------------------------------------------
SELECT 'otp_codes' AS bang, COUNT(*) AS so_dong FROM otp_codes;

SELECT COLUMN_NAME AS cot_moi_trong_submissions
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
  AND TABLE_NAME = 'submissions' AND COLUMN_NAME = 'is_verified_otp';

SELECT COLUMN_NAME AS cot_moi_trong_submission_images
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'hop_thu_an_ninh_so'
  AND TABLE_NAME = 'submission_images'
  AND COLUMN_NAME IN ('cloudinary_id', 'storage');


-- ╔════════════════════════════════════════════╗
-- ║  PHẦN 4/6 — V4: gửi ẩn danh
-- ╚════════════════════════════════════════════╝

-- =====================================================================
-- NÂNG CẤP V4 — GỬI Ý KIẾN ẨN DANH
--
-- Căn cứ nghiệp vụ: người tố giác sợ bị trả thù nên không dám cung cấp
-- danh tính. Luật Tố cáo quy định bảo vệ người tố cáo. Cho phép gửi
-- ẩn danh giúp thu thập được nguồn tin mà kênh truyền thống bỏ lỡ.
--
-- CÁCH CHẠY: HeidiSQL -> chọn hop_thu_an_ninh_so -> Load SQL file -> F9
-- AN TOÀN: không mất dữ liệu, chỉ thêm 1 cột + nới ràng buộc.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- 1) Cột đánh dấu ý kiến ẩn danh
ALTER TABLE submissions
    ADD COLUMN is_anonymous BOOLEAN DEFAULT FALSE
    COMMENT 'TRUE = người gửi chọn ẩn danh, không cung cấp danh tính';

-- 2) Cho phép danh tính NULL (ý kiến ẩn danh không có tên/SĐT)
ALTER TABLE submissions
    MODIFY sender_name  VARCHAR(255) NULL,
    MODIFY sender_phone VARCHAR(255) NULL;

-- KIỂM TRA
SELECT COLUMN_NAME, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='submissions'
  AND COLUMN_NAME IN ('is_anonymous','sender_name','sender_phone');


-- ╔════════════════════════════════════════════╗
-- ║  PHẦN 5/6 — V5: hàng chờ kiểm duyệt
-- ╚════════════════════════════════════════════╝

-- =====================================================================
-- NÂNG CẤP V5 — CHỐNG SPAM Ý KIẾN ẨN DANH
--
-- Vấn đề: ẩn danh không có SĐT/email để chặn -> kẻ xấu đổi IP là spam được.
-- Giải pháp: (1) hạn mức NGẶT HƠN cho ẩn danh
--            (2) HÀNG CHỜ KIỂM DUYỆT — ý kiến ẩn danh phải được cán bộ
--                duyệt mới vào quy trình xử lý chính (giống cách cơ quan
--                thật sàng lọc tin báo nặc danh).
--
-- CÁCH CHẠY: HeidiSQL -> chọn hop_thu_an_ninh_so -> Load SQL file -> F9
-- AN TOÀN: không mất dữ liệu.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- ---------------------------------------------------------------
-- 1) Thêm 2 trạng thái mới cho hàng chờ kiểm duyệt
--    pending_review = ý kiến ẩn danh chờ cán bộ duyệt
--    spam           = cán bộ đánh dấu là tin rác
-- ---------------------------------------------------------------
ALTER TABLE submissions
    MODIFY status ENUM('pending_review','received','processing','resolved','rejected','spam')
    NOT NULL DEFAULT 'received';

-- ---------------------------------------------------------------
-- 2) Ghi lại ai duyệt / lúc nào
-- ---------------------------------------------------------------
ALTER TABLE submissions
    ADD COLUMN reviewed_by INT NULL COMMENT 'Cán bộ đã duyệt ý kiến ẩn danh',
    ADD COLUMN reviewed_at DATETIME NULL;

ALTER TABLE submissions
    ADD CONSTRAINT fk_submission_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE submissions ADD INDEX idx_pending (status, is_anonymous, created_at);

-- ---------------------------------------------------------------
-- 3) View: đếm việc chờ duyệt (hiện băng cảnh báo trên dashboard)
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS vw_review_queue;
CREATE VIEW vw_review_queue AS
SELECT
    COUNT(*) AS pending_count,
    SUM(created_at < NOW() - INTERVAL 24 HOUR) AS pending_over_24h
FROM submissions
WHERE status = 'pending_review';

-- ---------------------------------------------------------------
-- 4) Cập nhật view thống kê cũ — KHÔNG tính tin chờ duyệt / tin rác
--    (nếu không, số liệu báo cáo bị thổi phồng bởi tin rác)
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS vw_sla_stats;
CREATE VIEW vw_sla_stats AS
SELECT
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL AND deadline_at < NOW())              AS overdue_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing')
        AND deadline_at IS NOT NULL AND deadline_at >= NOW()
        AND deadline_at < NOW() + INTERVAL 3 DAY)                         AS near_due_count,
    (SELECT COUNT(*) FROM submissions
      WHERE status IN ('received','processing') AND assigned_to IS NULL)  AS unassigned_count,
    (SELECT COUNT(*) FROM submissions WHERE status = 'pending_review')    AS pending_review_count;

-- ---------------------------------------------------------------
-- KIỂM TRA
-- ---------------------------------------------------------------
SELECT * FROM vw_review_queue;
SELECT * FROM vw_sla_stats;
SELECT status, COUNT(*) AS so_luong FROM submissions GROUP BY status;


-- ╔════════════════════════════════════════════╗
-- ║  PHẦN 6/6 — 12 tin tức tháng 7/2026
-- ╚════════════════════════════════════════════╝

-- =====================================================================
-- NẠP 12 TIN TỨC MỚI — Cập nhật 13/7/2026
--
-- ⭐ MỖI TIN CÓ LINK BÀI VIẾT CỤ THỂ (đã kiểm chứng, không phải link chung)
-- ⭐ MỖI TIN CÓ ẢNH (dùng ảnh danh thắng An Giang có sẵn trên web)
--
-- CÁCH CHẠY: HeidiSQL -> chọn hop_thu_an_ninh_so -> tab Query
--            -> dán TOÀN BỘ file này -> F9
--
-- KHÔNG cần deploy. Chạy xong bấm F5 trên web là thấy ngay.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- (TÙY CHỌN) Ẩn hết tin cũ. Muốn giữ tin cũ thì để nguyên dấu -- ở đầu dòng.
-- UPDATE news SET is_published = FALSE;

INSERT INTO news (title, summary, category, image_url, source_name, source_url, published_at, is_published) VALUES

-- ══════════ AN NINH TRẬT TỰ (4 tin) ══════════

('Tội phạm về trật tự xã hội tại An Giang giảm gần 20% trong 6 tháng đầu năm 2026',
 'Tại Hội nghị sơ kết công tác Công an ngày 4/7/2026, Công an tỉnh An Giang cho biết tội phạm về trật tự xã hội trên địa bàn được kéo giảm 19,74%. Lực lượng đã bảo đảm an toàn tuyệt đối cho 41 sự kiện chính trị, văn hóa quan trọng và 46 đoàn lãnh đạo cấp cao đến làm việc. Ba tập thể thuộc Công an tỉnh được trao Cờ thi đua của Chính phủ.',
 'security', '/media/bg-nui-sam.webp', 'baophapluat.vn',
 'https://baophapluat.vn/toi-pham-ve-trat-tu-xa-hoi-tai-an-giang-giam-gan-20-trong-6-thang-dau-nam-2026.html',
 CURDATE() - INTERVAL 9 DAY, TRUE),

('Cục An ninh điều tra Bộ Công an kiểm tra công tác tại Công an tỉnh An Giang',
 'Ngày 17-18/6/2026, Cục An ninh điều tra Bộ Công an tổ chức kiểm tra công tác An ninh điều tra 6 tháng đầu năm tại Phòng An ninh điều tra Công an tỉnh An Giang. Lực lượng An ninh điều tra đã nắm chắc, dự báo sát tình hình, chủ động tham mưu nhiều chủ trương, giải pháp trong điều tra, xử lý tội phạm, góp phần bảo đảm an ninh trật tự trên địa bàn tỉnh.',
 'security', '/media/bg-nui-cam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/cuc-an-ninh-dieu-tra-bo-cong-an-kiem-tra-cong-tac-an-ninh-dieu-tra-06-thang-dau-nam-2026-tai-phong-an-ninh-dieu-tra-cong-an-tinh-an-giang',
 CURDATE() - INTERVAL 25 DAY, TRUE),

('Công an tỉnh An Giang sơ kết công tác chính trị 6 tháng đầu năm 2026',
 'Ngày 9/7/2026, Phòng Công tác chính trị Công an tỉnh An Giang tổ chức Hội nghị sơ kết 6 tháng đầu năm. Đơn vị đã triển khai phong trào thi đua "Ba nhất: Kỷ luật nhất - Trung thành nhất - Gần dân nhất"; thực hiện 24 chuyên mục "Vì an ninh Tổ quốc" với 185 tin, bài phát sóng và gần 850 tin, bài đăng trên các nền tảng truyền thông của lực lượng.',
 'security', '/media/bg-ho-tinh-tam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/phong-cong-tac-chinh-tri-cong-an-tinh-an-giang-so-ket-cong-tac-6-thang-dau-nam-2026',
 CURDATE() - INTERVAL 4 DAY, TRUE),

('An Giang tập trung tăng trưởng kinh tế, ứng phó thiên tai và bảo đảm an ninh trật tự',
 'Trong 6 tháng đầu năm 2026, GRDP của An Giang ước tăng 8,83%, đứng đầu khu vực Đồng bằng sông Cửu Long. Về an ninh trật tự, lãnh đạo Công an tỉnh cho biết sẽ tiếp tục tăng cường đấu tranh phòng, chống các loại tội phạm, nhất là tội phạm sử dụng công nghệ cao, tội phạm ma túy và các hành vi vi phạm pháp luật trên không gian mạng.',
 'security', '/media/bg-lang-noi.webp', 'baophapluat.vn',
 'https://baophapluat.vn/an-giang-tap-trung-tang-truong-kinh-te-ung-pho-thien-tai-va-bao-ton-di-san-oc-eo.html',
 CURDATE() - INTERVAL 5 DAY, TRUE),

-- ══════════ CẢNH GIÁC (3 tin) ══════════

('Phòng, chống tội phạm đánh bạc, cá độ bóng đá mùa World Cup 2026',
 'World Cup 2026 diễn ra từ 11/6 đến 19/7/2026. Lợi dụng sức nóng mùa giải, các đối tượng lập website, ứng dụng cá độ có máy chủ đặt ở nước ngoài để lôi kéo người dân. Công an An Giang cảnh báo: cá độ bóng đá ăn tiền là hành vi đánh bạc, có thể bị phạt tù tới 7 năm (Điều 321) hoặc 10 năm nếu tổ chức đánh bạc (Điều 322 Bộ luật Hình sự). Bà con phát hiện dấu hiệu hãy tố giác ngay.',
 'warning', '/media/bg-nui-cam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/phong-chong-toi-pham-lien-quan-den-danh-bac-ca-do-bong-da-mua-world-cup-2026',
 CURDATE() - INTERVAL 1 DAY, TRUE),

('Công an phường Long Phú ứng dụng trí tuệ nhân tạo AI để tuyên truyền phòng ngừa đánh bạc',
 'Công an phường Long Phú đã đổi mới công tác tuyên truyền bằng cách ứng dụng trí tuệ nhân tạo (AI) tạo video, infographic và phim ngắn sinh động, dễ hiểu, đăng tải trên Facebook, Zalo OA và phát tại các cuộc họp dân. Qua đó giúp bà con nhận diện rõ thủ đoạn tổ chức đánh bạc, cá độ bóng đá trên không gian mạng trong mùa World Cup 2026.',
 'warning', '/media/bg-ho-tinh-tam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/cong-an-phuong-long-phu-day-manh-tuyen-tuyen-phong-ngua-toi-pham-danh-bac-trong-mua-world-cup-2026-bang-ung-dung-tri-tue-nhan-tao-ai',
 CURDATE() - INTERVAL 3 DAY, TRUE),

('Cảnh giác thủ đoạn dụ dỗ cá độ trực tuyến: "chơi thử miễn phí", "cam kết lợi nhuận"',
 'Công an xã An Châu cảnh báo các đối tượng thường quảng cáo trên mạng xã hội, trang tin thể thao và hội nhóm trực tuyến với những lời mời gọi như "chơi thử miễn phí", "tỷ lệ thắng cao", "cam kết lợi nhuận", "rút tiền nhanh" để dụ người chơi nạp tiền cá cược. Bà con tuyệt đối không truy cập, đăng ký tài khoản hoặc chia sẻ các đường link, hội nhóm có dấu hiệu tổ chức cá độ trái phép.',
 'warning', '/media/bg-nui-sam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/cong-an-xa-an-chau-khuyen-cao-nguoi-dan-khong-tham-gia-ca-do-bong-da-mua-world-cup-2026',
 CURDATE() - INTERVAL 7 DAY, TRUE),

-- ══════════ HƯỚNG DẪN (3 tin) ══════════

('Chiến dịch làm sạch dữ liệu, cấp căn cước và tài khoản định danh điện tử VNeID',
 'Chiến dịch rà soát, làm sạch, xây dựng dữ liệu; cấp căn cước, tài khoản định danh điện tử; Sổ sức khỏe điện tử trên VNeID được triển khai trên địa bàn tỉnh An Giang. Chiến dịch nhằm tạo điều kiện để bà con thực hiện các giao dịch, thủ tục hành chính mọi lúc, mọi nơi trên nền tảng định danh và xác thực điện tử.',
 'guide', '/media/bg-lang-noi.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/phat-dong-trien-khai-chien-dich-ra-soat-lam-sach-du-lieu-cap-can-cuoc-tai-khoan-dinh-danh-dien-tu',
 CURDATE() - INTERVAL 15 DAY, TRUE),

('Chỉ tiêu cụ thể của Chiến dịch: 100% công dân từ 6 tuổi được cấp thẻ Căn cước',
 'Chiến dịch triển khai từ 20/6/2026 đến 15/9/2026 với các chỉ tiêu: 100% công dân từ đủ 6 tuổi trở lên được cấp thẻ Căn cước; 95% người từ 14 tuổi trở lên có tài khoản định danh điện tử mức 2; 90% công dân có thẻ BHYT được tích hợp Sổ sức khỏe điện tử trên VNeID, hướng tới thay thế sổ khám bệnh bằng giấy.',
 'guide', '/media/bg-nui-cam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/xa-son-kien-phat-dong-chien-dich-ra-soat-lam-sach-xay-dung-du-lieu-cap-can-cuoc-tai-khoan-dinh-danh-dien-tu',
 CURDATE() - INTERVAL 20 DAY, TRUE),

('Hướng dẫn tích hợp Sổ sức khỏe điện tử trên ứng dụng VNeID',
 'Công an các xã, phường phối hợp ngành Y tế hướng dẫn bà con tích hợp và sử dụng Sổ sức khỏe điện tử trên ứng dụng VNeID, từng bước hình thành hồ sơ sức khỏe điện tử, tạo thuận lợi trong khám chữa bệnh. Bà con chưa có tài khoản định danh mức 2 hãy liên hệ Công an nơi cư trú để được hỗ trợ đăng ký, kích hoạt.',
 'guide', '/media/bg-ho-tinh-tam.webp', 'congan.angiang.gov.vn',
 'https://congan.angiang.gov.vn/hoa-hung-phat-dong-chien-dich-lam-sach-du-lieu-cap-can-cuoc-va-dinh-danh-dien-tu',
 CURDATE() - INTERVAL 21 DAY, TRUE),

-- ══════════ VĂN BẢN (2 tin) ══════════

('Nghị quyết 10-NQ/TW của Bộ Chính trị về phát triển kinh tế có vốn đầu tư nước ngoài',
 'Ngày 8/6/2026, Tổng Bí thư, Chủ tịch nước Tô Lâm thay mặt Bộ Chính trị ký ban hành Nghị quyết số 10-NQ/TW về phát triển kinh tế có vốn đầu tư nước ngoài. Nghị quyết thể hiện sự thay đổi trong tư duy phát triển: chuyển từ thu hút đầu tư sang phát triển kinh tế có vốn đầu tư nước ngoài, từ coi trọng quy mô vốn sang coi trọng chất lượng, hiệu quả và giá trị gia tăng.',
 'document', '/media/bg-nui-sam.webp', 'vietnamplus.vn',
 'https://www.vietnamplus.vn/nghi-quyet-10-nqtw-the-hien-su-thay-doi-trong-tu-duy-phat-trien-post1121402.vnp',
 CURDATE() - INTERVAL 13 DAY, TRUE),

('Toàn văn Nghị quyết 10-NQ/TW: mục tiêu đến năm 2045 đóng góp 30% GDP',
 'Nghị quyết 10-NQ/TW xác định 6 quan điểm chỉ đạo và 8 chính sách quan trọng. Mục tiêu đến năm 2045, khu vực kinh tế có vốn đầu tư nước ngoài chiếm khoảng 25% tổng vốn đầu tư toàn xã hội và đóng góp khoảng 30% GDP. Nghị quyết ưu tiên thu hút đầu tư vào chip bán dẫn, trí tuệ nhân tạo, dữ liệu lớn, công nghệ sinh học và công nghiệp xanh.',
 'document', '/media/bg-lang-noi.webp', 'thuvienphapluat.vn',
 'https://thuvienphapluat.vn/phap-luat/ho-tro-phap-luat/toan-van-nghi-quyet-10nqtw-phat-trien-kinh-te-co-von-dau-tu-nuoc-ngoai-ngay-862026-ra-sao-274324.html',
 CURDATE() - INTERVAL 14 DAY, TRUE);


-- =====================================================================
-- XỬ LÝ TIN CŨ — tránh "thẻ chết" (bấm vào không đi đâu)
-- =====================================================================
-- Thẻ tin giờ BẤM CẢ THẺ để mở bài viết.
-- Tin CŨ nào không có link -> bấm vào không đi đâu -> bà con tưởng web hỏng.
-- Tin CŨ nào không có ảnh  -> hệ thống lấy ảnh NGẪU NHIÊN từ picsum.photos
--                             (có thể ra ảnh con mèo, phong cảnh... rất kỳ).
--
-- Cách xử lý: ẨN các tin cũ thiếu link (an toàn, lấy lại được bất cứ lúc nào).
-- ---------------------------------------------------------------

-- Xem trước tin nào sẽ bị ẩn
SELECT id, LEFT(title, 50) AS tieu_de,
       IF(source_url IS NULL OR source_url = '', 'THIẾU LINK', 'ok')  AS link,
       IF(image_url IS NULL OR image_url = '', 'THIẾU ẢNH', 'ok')     AS anh
FROM news
WHERE is_published = TRUE
  AND (source_url IS NULL OR source_url = '');

-- Ẩn tin cũ thiếu link (bỏ dấu -- ở đầu dòng dưới để chạy)
UPDATE news SET is_published = FALSE
WHERE (source_url IS NULL OR source_url = '');

-- Tin cũ nào CÓ link nhưng THIẾU ảnh -> gắn ảnh danh thắng cho đỡ trống
UPDATE news SET image_url = '/media/bg-nui-cam.webp'
WHERE is_published = TRUE AND (image_url IS NULL OR image_url = '');


-- =====================================================================
-- KIỂM TRA
-- =====================================================================
SELECT id, LEFT(title, 50) AS tieu_de, category, image_url IS NOT NULL AS co_anh,
       source_url IS NOT NULL AS co_link
FROM news ORDER BY id DESC LIMIT 12;

SELECT category AS nhom, COUNT(*) AS so_tin
FROM news WHERE is_published = TRUE GROUP BY category;

-- Đếm tin thiếu ảnh hoặc thiếu link (phải ra 0)
SELECT COUNT(*) AS tin_thieu_anh_hoac_link
FROM news
WHERE is_published = TRUE
  AND (image_url IS NULL OR image_url = '' OR source_url IS NULL OR source_url = '');


-- ╔════════════════════════════════════════════╗
-- ║  KIỂM TRA TỔNG — chạy xong xem các bảng này
-- ╚════════════════════════════════════════════╝
USE hop_thu_an_ninh_so;

SELECT 'banned_words (phải 26)'      AS kiem_tra, COUNT(*) AS ket_qua FROM banned_words
UNION ALL SELECT 'categories (phải 4)',            COUNT(*) FROM categories
UNION ALL SELECT 'wards (phải >= 14)',             COUNT(*) FROM wards
UNION ALL SELECT 'news đang hiện (phải 12)',       COUNT(*) FROM news WHERE is_published = TRUE
UNION ALL SELECT 'cột is_anonymous (phải 1)',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='submissions' AND COLUMN_NAME='is_anonymous')
UNION ALL SELECT 'cột reviewed_by (phải 1)',
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='submissions' AND COLUMN_NAME='reviewed_by')
UNION ALL SELECT 'bảng otp_codes (phải 1)',
  (SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA='hop_thu_an_ninh_so' AND TABLE_NAME='otp_codes');
