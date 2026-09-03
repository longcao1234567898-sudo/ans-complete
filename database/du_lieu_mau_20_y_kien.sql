-- ============================================================================
-- 20 Ý KIẾN MẪU ĐỂ THỬ BẢN ĐỒ VÀ CẢNH BÁO ĐỊA BÀN
-- ============================================================================
--
-- Dùng để xem bản đồ điểm nóng, cảnh báo theo địa bàn và các bộ lọc hoạt động
-- ra sao khi có dữ liệu thật. Toạ độ rải quanh 14 địa bàn của Tân Châu, tập
-- trung nhiều hơn ở vài nơi để bản đồ có điểm nóng rõ ràng.
--
-- ⚠️ ĐÂY LÀ DỮ LIỆU THỬ. Trước khi bàn giao cho đơn vị dùng thật, xoá đi bằng:
--       DELETE FROM submissions WHERE original_content LIKE '%[MAU THU]%';
--    (các tin dưới đây đều có dấu này ở cuối nội dung)
--
-- ⚠️ CẦN CHẠY TRƯỚC: nang_cap_v2.sql (bảng wards) và nang_cap_v16.sql (cột toạ độ).
--
-- CÁCH CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- ============================================================================

INSERT INTO submissions
  (tracking_code, category_id, ward_id, original_content, ai_processed_content,
   urgency, status, is_anonymous, incident_lat, incident_lng, created_at)
VALUES
('Q496RA', 1, 1, 'Khoảng 22 giờ tối qua, tôi thấy có nhóm khoảng năm sáu thanh niên tụ tập sau chợ, có biểu hiện mua bán chất cấm. Họ đi hai xe máy, một chiếc màu đỏ không biển số. Mong công an kiểm tra.', 'Khoảng 22 giờ tối qua, tôi thấy có nhóm khoảng năm sáu thanh niên tụ tập sau chợ, có biểu hiện mua bán chất cấm. Họ đi hai xe máy, một chiếc màu đỏ không biển số. Mong công an kiểm tra.', 'urgent', 'received', 0, 10.7908589, 105.2430604, DATE_SUB(NOW(), INTERVAL 16 DAY)),
('WP3SYY', 1, 1, 'Nhà kế bên tôi thường xuyên có người lạ ra vào lúc nửa đêm, mỗi lần chỉ vài phút rồi đi. Nghi có mua bán ma tuý. Tôi xin được giấu tên.', 'Nhà kế bên tôi thường xuyên có người lạ ra vào lúc nửa đêm, mỗi lần chỉ vài phút rồi đi. Nghi có mua bán ma tuý. Tôi xin được giấu tên.', 'urgent', 'resolved', 1, 10.8027409, 105.2336577, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('FUU7KV', 1, 1, 'Có một quán trong ấp tổ chức đánh bài ăn tiền gần như mỗi tối, đông người tụ tập gây mất trật tự tới khuya.', 'Có một quán trong ấp tổ chức đánh bài ăn tiền gần như mỗi tối, đông người tụ tập gây mất trật tự tới khuya.', 'important', 'processing', 0, 10.8073233, 105.2549917, DATE_SUB(NOW(), INTERVAL 16 DAY)),
('39H593', 1, 2, 'Xe tải chở cát chạy ban đêm không che chắn, tôi nghi khai thác cát trái phép ở khúc sông gần bến đò.', 'Xe tải chở cát chạy ban đêm không che chắn, tôi nghi khai thác cát trái phép ở khúc sông gần bến đò.', 'important', 'received', 1, 10.7965937, 105.2430607, DATE_SUB(NOW(), INTERVAL 11 DAY)),
('BQJDG5', 1, 6, 'Tôi bị một số điện thoại lạ gọi tự xưng công an, yêu cầu chuyển tiền để chứng minh trong sạch. Tôi chưa chuyển nhưng muốn báo để bà con khác cảnh giác.', 'Tôi bị một số điện thoại lạ gọi tự xưng công an, yêu cầu chuyển tiền để chứng minh trong sạch. Tôi chưa chuyển nhưng muốn báo để bà con khác cảnh giác.', 'urgent', 'resolved', 0, 10.8460021, 105.2102074, DATE_SUB(NOW(), INTERVAL 13 DAY)),
('78S3V8', 1, 3, 'Gần đây khu tôi mất trộm mấy con gà và một chiếc xe đạp. Nghi có người lạ dò la ban ngày.', 'Gần đây khu tôi mất trộm mấy con gà và một chiếc xe đạp. Nghi có người lạ dò la ban ngày.', 'normal', 'received', 0, 10.794281, 105.2345707, DATE_SUB(NOW(), INTERVAL 7 DAY)),
('ACK79Z', 1, 9, 'Có nhóm cho vay lãi nặng dán tờ rơi khắp cột điện, có người trong xóm vay rồi bị đe doạ đòi nợ.', 'Có nhóm cho vay lãi nặng dán tờ rơi khắp cột điện, có người trong xóm vay rồi bị đe doạ đòi nợ.', 'important', 'processing', 1, 10.7593175, 105.2546468, DATE_SUB(NOW(), INTERVAL 6 DAY)),
('95CUW7', 3, 1, 'Đèn đường đoạn qua cầu bị hỏng hơn hai tuần, tối đi lại rất nguy hiểm, đã có người té xe.', 'Đèn đường đoạn qua cầu bị hỏng hơn hai tuần, tối đi lại rất nguy hiểm, đã có người té xe.', 'important', 'resolved', 0, 10.8101162, 105.2372427, DATE_SUB(NOW(), INTERVAL 15 DAY)),
('6M58ET', 3, 4, 'Bãi rác tự phát ven đường ngày càng lớn, mùi hôi ảnh hưởng các hộ xung quanh, mong xử lý.', 'Bãi rác tự phát ven đường ngày càng lớn, mùi hôi ảnh hưởng các hộ xung quanh, mong xử lý.', 'normal', 'processing', 0, 10.7990035, 105.237361, DATE_SUB(NOW(), INTERVAL 22 DAY)),
('K6AFA6', 3, 3, 'Đề nghị lắp thêm camera ở ngã ba gần trường học vì hay có xe chạy ẩu giờ tan trường.', 'Đề nghị lắp thêm camera ở ngã ba gần trường học vì hay có xe chạy ẩu giờ tan trường.', 'normal', 'resolved', 0, 10.8046783, 105.2318831, DATE_SUB(NOW(), INTERVAL 6 DAY)),
('RHCTYK', 3, 2, 'Quán karaoke mở nhạc quá lớn tới một hai giờ sáng, cả xóm không ngủ được, đã nhắc nhiều lần.', 'Quán karaoke mở nhạc quá lớn tới một hai giờ sáng, cả xóm không ngủ được, đã nhắc nhiều lần.', 'important', 'received', 0, 10.8099354, 105.2483723, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('JQ8JUF', 3, 5, 'Đường vào ấp có nhiều ổ gà lớn, mùa mưa đọng nước, xe máy hay bị ngã.', 'Đường vào ấp có nhiều ổ gà lớn, mùa mưa đọng nước, xe máy hay bị ngã.', 'normal', 'resolved', 0, 10.7701231, 105.23395, DATE_SUB(NOW(), INTERVAL 18 DAY)),
('42KN2A', 3, 8, 'Chó thả rông nhiều, có trường hợp cắn người đi đường, mong nhắc nhở các hộ nuôi.', 'Chó thả rông nhiều, có trường hợp cắn người đi đường, mong nhắc nhở các hộ nuôi.', 'normal', 'processing', 0, 10.7680267, 105.2038429, DATE_SUB(NOW(), INTERVAL 4 DAY)),
('YYBB8W', 3, 4, 'Có người bán hàng rong lấn hết vỉa hè trước cổng trường, học sinh phải đi xuống lòng đường.', 'Có người bán hàng rong lấn hết vỉa hè trước cổng trường, học sinh phải đi xuống lòng đường.', 'important', 'received', 0, 10.8000118, 105.2443444, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('7LKP5X', 2, 1, 'Tôi nộp hồ sơ xin xác nhận cư trú đã hơn hai tuần nhưng chưa nhận được kết quả, đi hỏi thì được bảo chờ.', 'Tôi nộp hồ sơ xin xác nhận cư trú đã hơn hai tuần nhưng chưa nhận được kết quả, đi hỏi thì được bảo chờ.', 'important', 'resolved', 0, 10.8043871, 105.2418034, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('3CNMCD', 2, 3, 'Tôi khiếu nại về việc bị thu phí không có biên lai khi làm thủ tục tại một điểm dịch vụ.', 'Tôi khiếu nại về việc bị thu phí không có biên lai khi làm thủ tục tại một điểm dịch vụ.', 'normal', 'received', 0, 10.7940116, 105.2285998, DATE_SUB(NOW(), INTERVAL 22 DAY)),
('BJPJLM', 4, 6, 'Xin hỏi thủ tục đăng ký tạm trú cho người ở tỉnh khác tới làm việc cần giấy tờ gì ạ?', 'Xin hỏi thủ tục đăng ký tạm trú cho người ở tỉnh khác tới làm việc cần giấy tờ gì ạ?', 'normal', 'resolved', 0, 10.8348437, 105.222113, DATE_SUB(NOW(), INTERVAL 6 DAY)),
('2VMYMS', 4, 7, 'Đề nghị mở thêm buổi tuyên truyền phòng chống lừa đảo qua điện thoại cho người lớn tuổi trong ấp.', 'Đề nghị mở thêm buổi tuyên truyền phòng chống lừa đảo qua điện thoại cho người lớn tuổi trong ấp.', 'normal', 'received', 0, 10.8523593, 105.1942085, DATE_SUB(NOW(), INTERVAL 13 DAY)),
('7MW86H', 4, 2, 'Tôi muốn hỏi cách làm căn cước cho cháu vừa đủ mười bốn tuổi, cần mang theo giấy tờ nào?', 'Tôi muốn hỏi cách làm căn cước cho cháu vừa đủ mười bốn tuổi, cần mang theo giấy tờ nào?', 'normal', 'processing', 0, 10.807134, 105.2499818, DATE_SUB(NOW(), INTERVAL 13 DAY)),
('PQAF7X', 4, 10, 'Đề xuất đặt bảng thông báo số điện thoại trực ban ở nhà văn hoá ấp để bà con tiện gọi khi cần.', 'Đề xuất đặt bảng thông báo số điện thoại trực ban ở nhà văn hoá ấp để bà con tiện gọi khi cần.', 'normal', 'received', 0, 10.760654, 105.1905928, DATE_SUB(NOW(), INTERVAL 8 DAY));

-- Đánh dấu là dữ liệu thử để sau này xoá cho dễ
UPDATE submissions
   SET original_content = CONCAT(original_content, ' [MAU THU]')
 WHERE tracking_code IN ('7MW86H', '39H593', 'PQAF7X', '7LKP5X', 'BQJDG5', 'RHCTYK', 'JQ8JUF', '3CNMCD', '6M58ET', '42KN2A', 'WP3SYY', 'YYBB8W', 'ACK79Z', '78S3V8', 'Q496RA', '95CUW7', 'K6AFA6', 'FUU7KV', 'BJPJLM', '2VMYMS');

-- ============================================================================
-- KIỂM TRA SAU KHI CHẠY
-- ============================================================================
SELECT w.name AS dia_ban, COUNT(*) AS so_tin,
       SUM(s.category_id = 1) AS to_giac,
       SUM(s.urgency = 'urgent') AS khan_cap
  FROM submissions s JOIN wards w ON w.id = s.ward_id
 WHERE s.original_content LIKE '%[MAU THU]%'
 GROUP BY w.name ORDER BY so_tin DESC;
