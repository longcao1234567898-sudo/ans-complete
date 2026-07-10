-- ============================================================
-- HỘP THƯ AN NINH SỐ — Database (bản CHỐNG LỖI IMPORT)
-- Công an thị xã Tân Châu, tỉnh An Giang  |  MySQL 8.0+ / MariaDB 10.4+
--
-- CÁCH DÙNG (phpMyAdmin):
--   Về trang chủ phpMyAdmin (KHÔNG chọn database nào) -> tab Import
--   -> chọn file này -> Go. File tự tạo lại database sạch, chạy được nhiều lần.
--
-- Vì sao bản này không lỗi giữa chừng:
--   - Tự XOA sạch bảng/đối tượng cũ trước khi tạo (hết lỗi "table already exists")
--   - Tắt kiểm tra khoá ngoại khi tạo bảng (hết lỗi thứ tự phụ thuộc)
--   - Toàn bộ bảng + dữ liệu chạy TRƯỚC; trigger/hàm/thủ tục (cần DELIMITER)
--     dồn xuống CUỐI - có trục trặc phần đó thì dữ liệu vẫn nguyên vẹn.
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
    image_url VARCHAR(500) NOT NULL,
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
 'security', '/images/news/bien-gioi.jpg', 'congan.angiang.gov.vn', 'https://congan.angiang.gov.vn', CURDATE() - INTERVAL 1 DAY),
('Tuần tra đêm khép kín địa bàn các phường Long Thạnh, Long Châu, Long Phú',
 'Tổ tuần tra 161 Công an thị xã Tân Châu duy trì tuần tra vũ trang ban đêm, kịp thời phát hiện, ngăn chặn các nhóm thanh thiếu niên tụ tập gây rối trật tự công cộng.',
 'security', '/images/news/tuan-tra.jpg', 'Fanpage Công an TX Tân Châu', 'https://www.facebook.com/conganthixatanchauangiang', CURDATE() - INTERVAL 3 DAY),
('Cảnh giác chiêu trò việc nhẹ lương cao dụ dỗ xuất cảnh trái phép sang Campuchia',
 'Địa bàn biên giới Tân Châu là điểm nóng của thủ đoạn lôi kéo lao động vượt biên rồi cưỡng bức làm việc trong các cơ sở lừa đảo trực tuyến. Người dân tuyệt đối không tin lời mời chào trên mạng xã hội.',
 'warning', '/images/news/lua-dao.jpg', 'bocongan.gov.vn', 'https://bocongan.gov.vn', CURDATE() - INTERVAL 4 DAY),
('Giả danh công an gọi điện yêu cầu cài ứng dụng, chuyển tiền - thủ đoạn cũ, nạn nhân mới',
 'Đối tượng mạo danh cán bộ điều tra đe doạ nạn nhân liên quan vụ án rồi yêu cầu chuyển tiền vào tài khoản tạm giữ. Công an không bao giờ làm việc qua điện thoại kèm yêu cầu chuyển tiền, đọc mã OTP.',
 'warning', '/images/news/gia-danh.jpg', 'luatvietnam.vn', 'https://luatvietnam.vn', CURDATE() - INTERVAL 6 DAY),
('Hướng dẫn đăng ký cư trú trực tuyến trên ứng dụng VNeID',
 'Từng bước khai báo tạm trú, tạm vắng ngay trên điện thoại: chuẩn bị giấy tờ, điền tờ khai điện tử, theo dõi kết quả - không cần đến trụ sở công an.',
 'guide', '/images/news/vneid.jpg', 'dichvucong.gov.vn', 'https://dichvucong.gov.vn', CURDATE() - INTERVAL 8 DAY),
('Công an Tân Châu cấp căn cước lưu động cho người già yếu, bệnh tật tại nhà',
 'Tổ công tác mang thiết bị thu nhận sinh trắc học đến tận nhà phục vụ người cao tuổi, người khuyết tật trên địa bàn các phường, xã - bảo đảm không ai bị bỏ lại phía sau trong Đề án 06.',
 'guide', '/images/news/can-cuoc.jpg', 'congan.angiang.gov.vn', 'https://congan.angiang.gov.vn', CURDATE() - INTERVAL 10 DAY),
('Nghị quyết 57-NQ/TW: đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia',
 'Bộ Chính trị xác định khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số là đột phá quan trọng hàng đầu - nền tảng để hiện đại hoá quản trị quốc gia, trong đó có chuyển đổi số ngành Công an.',
 'document', '/images/news/nq57.jpg', 'xaydungchinhsach.chinhphu.vn', 'https://xaydungchinhsach.chinhphu.vn', CURDATE() - INTERVAL 12 DAY),
('Nghị quyết 66-NQ/TW về đổi mới công tác xây dựng và thi hành pháp luật trong kỷ nguyên mới',
 'Hoàn thiện thể chế, đưa pháp luật đi vào cuộc sống - cơ sở chính trị quan trọng để các mô hình tiếp nhận ý kiến công dân như Hộp Thư An Ninh Số hoạt động minh bạch, đúng quy định.',
 'document', '/images/news/nq66.jpg', 'vbpl.vn', 'https://vbpl.vn', CURDATE() - INTERVAL 15 DAY);

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
