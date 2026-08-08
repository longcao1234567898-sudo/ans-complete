-- =====================================================================
-- NẠP LẠI TIN TỨC — Hộp Thư An Ninh Số
-- Dùng khi trang Tin tức trống trơn (bảng news rỗng).
-- Cách chạy: HeidiSQL -> chọn database hop_thu_an_ninh_so
--            -> File -> Load SQL file -> chọn file này -> bấm F9
-- An toàn: chỉ động vào bảng news, KHÔNG ảnh hưởng ý kiến người dân.
-- =====================================================================

USE hop_thu_an_ninh_so;

-- Xoá tin cũ (nếu có) rồi nạp lại từ đầu
DELETE FROM news;
ALTER TABLE news AUTO_INCREMENT = 1;

-- image_url để NULL -> hệ thống tự dùng ảnh minh hoạ, không bị vỡ ảnh
INSERT INTO news (title, summary, category, image_url, source_name, source_url, published_at, is_published) VALUES

('Công an thị xã Tân Châu ra quân cao điểm bảo đảm ANTT tuyến biên giới Vĩnh Xương',
 'Lực lượng Công an thị xã phối hợp Đồn Biên phòng cửa khẩu quốc tế Vĩnh Xương tuần tra khép kín tuyến biên giới, phòng chống buôn lậu, xuất nhập cảnh trái phép và tội phạm ma tuý.',
 'security', NULL, 'congan.angiang.gov.vn', 'https://congan.angiang.gov.vn', CURDATE() - INTERVAL 1 DAY, TRUE),

('Tuần tra khép kín 161 tuyến đường, bảo đảm trật tự an toàn giao thông',
 'Công an thị xã Tân Châu duy trì tuần tra vũ trang ban đêm, kịp thời phát hiện, ngăn chặn các hành vi gây rối trật tự công cộng trên địa bàn.',
 'security', NULL, 'Fanpage Công an TX Tân Châu', 'https://congan.angiang.gov.vn', CURDATE() - INTERVAL 3 DAY, TRUE),

('Cảnh giác chiêu trò lừa đảo "việc nhẹ lương cao" sang Campuchia',
 'Đối tượng dụ dỗ người dân qua mạng xã hội, hứa hẹn công việc nhàn hạ thu nhập cao, sau đó đưa sang biên giới cưỡng bức lao động. Người dân tuyệt đối không tin theo lời mời gọi trên mạng.',
 'warning', NULL, 'bocongan.gov.vn', 'https://bocongan.gov.vn', CURDATE() - INTERVAL 4 DAY, TRUE),

('Giả danh công an gọi điện yêu cầu chuyển tiền "xác minh tài khoản"',
 'Cảnh báo thủ đoạn mạo danh cán bộ Công an gọi điện thông báo người dân liên quan vụ án, yêu cầu chuyển tiền vào tài khoản "tạm giữ". Công an không bao giờ làm việc qua điện thoại theo cách này.',
 'warning', NULL, 'luatvietnam.vn', 'https://luatvietnam.vn', CURDATE() - INTERVAL 6 DAY, TRUE),

('Hướng dẫn đăng ký định danh điện tử mức độ 2 trên VNeID',
 'Người dân mang theo CCCD gắn chip đến trụ sở Công an nơi cư trú để được hỗ trợ đăng ký tài khoản định danh điện tử mức độ 2, phục vụ các thủ tục hành chính trực tuyến.',
 'guide', NULL, 'dichvucong.gov.vn', 'https://dichvucong.dancuquocgia.gov.vn', CURDATE() - INTERVAL 8 DAY, TRUE),

('Thủ tục đăng ký tạm trú cho người thuê trọ',
 'Chủ nhà trọ có trách nhiệm thông báo lưu trú cho người thuê trong vòng 30 ngày. Có thể thực hiện trực tuyến qua Cổng dịch vụ công hoặc ứng dụng VNeID.',
 'guide', NULL, 'dichvucong.gov.vn', 'https://dichvucong.dancuquocgia.gov.vn', CURDATE() - INTERVAL 10 DAY, TRUE),

('Luật Căn cước 2023 — những điểm mới người dân cần biết',
 'Luật Căn cước có hiệu lực với nhiều thay đổi về thông tin trên thẻ, cấp thẻ cho người dưới 14 tuổi và tích hợp thông tin sinh trắc học.',
 'document', NULL, 'xaydungchinhsach.chinhphu.vn', 'https://xaydungchinhsach.chinhphu.vn', CURDATE() - INTERVAL 12 DAY, TRUE),

('Nghị quyết 66-NQ/TW về đổi mới công tác xây dựng và thi hành pháp luật',
 'Hoàn thiện thể chế, đẩy mạnh phân cấp phân quyền, tăng cường ứng dụng chuyển đổi số trong công tác quản lý nhà nước về an ninh trật tự.',
 'document', NULL, 'vbpl.vn', 'https://vbpl.vn', CURDATE() - INTERVAL 15 DAY, TRUE);

-- Kiểm tra kết quả: phải ra 8
SELECT COUNT(*) AS 'So tin da nap' FROM news;
