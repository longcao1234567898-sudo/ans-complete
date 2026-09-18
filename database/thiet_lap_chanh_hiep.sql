-- ============================================================================
-- THIẾT LẬP ĐỊA BÀN PHƯỜNG CHÁNH HIỆP, THÀNH PHỐ HỒ CHÍ MINH
-- Xoá sạch dữ liệu địa bàn cũ · Nạp 8 khu phố · Nạp 80 ý kiến mẫu
-- ============================================================================
--
-- ⚠️ TỆP NÀY XOÁ DỮ LIỆU. Đọc kỹ trước khi chạy.
--
-- Nó xoá TOÀN BỘ ý kiến, tin nhắn, lịch sử xử lý, ảnh đính kèm, nhóm sự việc
-- và địa bàn cũ. Tài khoản cán bộ, từ khoá phân loại và cấu hình hệ thống thì
-- GIỮ NGUYÊN.
--
-- Nên sao lưu trước: cd server && node scripts-sao-luu.js
--
-- ----------------------------------------------------------------------------
-- ĐỊA GIỚI HÀNH CHÍNH HIỆN HÀNH
--
-- Từ 01/7/2025 theo Nghị quyết 202/2025/QH15, toàn bộ tỉnh Bình Dương sáp nhập
-- vào Thành phố Hồ Chí Minh. TỈNH BÌNH DƯƠNG KHÔNG CÒN TỒN TẠI.
--
-- Phường Chánh Hiệp lập theo Nghị quyết 1685/NQ-UBTVQH15, từ toàn bộ phường
-- Định Hoà và Tương Bình Hiệp cũ của thành phố Thủ Dầu Một, nay trực thuộc
-- Thành phố Hồ Chí Minh. Trụ sở đặt tại Tương Bình Hiệp cũ.
--
-- CHẠY: HeidiSQL -> dán toàn bộ -> F9
-- ============================================================================

USE hop_thu_an_ninh_so;


-- ---------------------------------------------------------------------------
-- BƯỚC 1 — XOÁ DỮ LIỆU CŨ
-- ---------------------------------------------------------------------------
--
-- ⚠️ THỨ TỰ XOÁ QUAN TRỌNG: bảng con trước, bảng cha sau. Xoá ngược thứ tự thì
--    khoá ngoại chặn lại và câu lệnh hỏng giữa chừng, để lại dữ liệu dở dang.

DELETE FROM report_messages;
DELETE FROM status_history;
DELETE FROM submission_images;
DELETE FROM incident_groups;
DELETE FROM submissions;
DELETE FROM traffic_hotspots;

-- Gỡ tham chiếu địa bàn ở mã QR rồi mới xoá địa bàn
UPDATE qr_points SET ward_id = NULL WHERE ward_id IS NOT NULL;
DELETE FROM wards;

ALTER TABLE submissions AUTO_INCREMENT = 1;
ALTER TABLE wards AUTO_INCREMENT = 1;


-- ---------------------------------------------------------------------------
-- BƯỚC 2 — NẠP 8 KHU PHỐ CỦA PHƯỜNG CHÁNH HIỆP
-- ---------------------------------------------------------------------------
--
-- ⚠️ TOẠ ĐỘ LÀ SỐ GẦN ĐÚNG. Cán bộ nên chỉnh lại cho khớp thực địa: mở Google
--    Maps, bấm chuột phải vào trung tâm khu phố, chép dãy số hiện ra. Không
--    chỉnh thì bản đồ điểm nóng hiện lệch vị trí.

INSERT INTO wards (id, name, lat, lng, display_order) VALUES
  (1, 'Khu phố Tương Bình Hiệp', 11.0180000, 106.6480000, 1),
  (2, 'Khu phố Chánh Thiện',     11.0135000, 106.6520000, 2),
  (3, 'Khu phố Chánh Lộc',       11.0090000, 106.6555000, 3),
  (4, 'Khu phố Định Hoà',        11.0245000, 106.6600000, 4),
  (5, 'Khu phố Hoà Long',        11.0300000, 106.6455000, 5),
  (6, 'Khu phố Bình Hoà',        11.0060000, 106.6420000, 6),
  (7, 'Khu phố Bình Đức',        11.0215000, 106.6390000, 7),
  (8, 'Khu phố Bình Hiệp',       11.0150000, 106.6640000, 8);


-- ---------------------------------------------------------------------------
-- BƯỚC 3 — ĐỔI TÊN HỆ THỐNG TRONG BẢNG CẤU HÌNH
-- ---------------------------------------------------------------------------
-- Cột tên là `key` và `value`, phải bọc dấu huyền vì "key" là từ khoá MySQL.

UPDATE system_settings SET `value` = 'Điểm Chạm An Ninh' WHERE `key` = 'site_name';


-- ---------------------------------------------------------------------------
-- BƯỚC 4 — ẨN TIN TỨC CỦA ĐỊA BÀN CŨ
-- ---------------------------------------------------------------------------
-- Ẩn thay vì xoá, để còn tra lại được đơn vị đã từng đăng gì.

UPDATE news SET is_published = 0
 WHERE title LIKE '%Tân Châu%' OR content LIKE '%Tân Châu%'
    OR title LIKE '%An Giang%' OR content LIKE '%An Giang%';


-- ---------------------------------------------------------------------------
-- BƯỚC 5 — NẠP 80 Ý KIẾN MẪU CỦA ĐỊA BÀN MỚI
-- ---------------------------------------------------------------------------
--
-- Nội dung sát với đời sống đô thị cấp phường: tố giác, khiếu nại, phản ánh
-- hạ tầng và đề xuất thủ tục. Rải trong 60 ngày gần nhất, tập trung hơn ở vài
-- khu phố để bản đồ điểm nóng và cảnh báo địa bàn có ý nghĩa.
--
-- ⚠️ ĐÂY LÀ DỮ LIỆU THỬ. Trước khi bàn giao cho đơn vị dùng thật, xoá bằng:
--       DELETE FROM submissions WHERE original_content LIKE '%[MAU THU]%';

INSERT INTO submissions
  (tracking_code, category_id, ward_id, original_content, ai_processed_content,
   urgency, status, is_anonymous, incident_lat, incident_lng, created_at)
VALUES
('73CPZP', 1, 4, 'Khoảng 22 giờ tối qua, tôi thấy nhóm khoảng năm sáu thanh niên tụ tập phía sau dãy nhà trọ, có biểu hiện mua bán chất cấm. Họ đi ba xe máy, một chiếc màu đỏ không gắn biển số.', 'Khoảng 22 giờ tối qua, tôi thấy nhóm khoảng năm sáu thanh niên tụ tập phía sau dãy nhà trọ, có biểu hiện mua bán chất cấm. Họ đi ba xe máy, một chiếc màu đỏ không gắn biển số.', 'urgent', 'received', 1, 11.0269745, 106.6636008, DATE_SUB(NOW(), INTERVAL 45 DAY)),
('9GEAZ7', 1, 8, 'Căn nhà cho thuê cạnh nhà tôi thường xuyên có người lạ ra vào lúc nửa đêm, mỗi lần chỉ vài phút rồi đi ngay. Tôi nghi có mua bán ma tuý, xin được giấu tên.', 'Căn nhà cho thuê cạnh nhà tôi thường xuyên có người lạ ra vào lúc nửa đêm, mỗi lần chỉ vài phút rồi đi ngay. Tôi nghi có mua bán ma tuý, xin được giấu tên.', 'urgent', 'processing', 0, 11.0198697, 106.6630583, DATE_SUB(NOW(), INTERVAL 46 DAY)),
('2QVTJN', 1, 1, 'Có một quán trong khu phố tổ chức đánh bài ăn tiền gần như mỗi tối, đông người tụ tập tới khuya gây mất trật tự.', 'Có một quán trong khu phố tổ chức đánh bài ăn tiền gần như mỗi tối, đông người tụ tập tới khuya gây mất trật tự.', 'important', 'received', 0, 11.0221292, 106.6483713, DATE_SUB(NOW(), INTERVAL 12 DAY)),
('XWYZQL', 1, 6, 'Tôi nhận cuộc gọi tự xưng cán bộ công an, đọc đúng họ tên tôi rồi yêu cầu chuyển tiền để chứng minh trong sạch. Tôi chưa chuyển nhưng muốn báo để bà con khác cảnh giác.', 'Tôi nhận cuộc gọi tự xưng cán bộ công an, đọc đúng họ tên tôi rồi yêu cầu chuyển tiền để chứng minh trong sạch. Tôi chưa chuyển nhưng muốn báo để bà con khác cảnh giác.', 'urgent', 'received', 0, 11.0054545, 106.6453865, DATE_SUB(NOW(), INTERVAL 36 DAY)),
('QHE36E', 1, 2, 'Có nhóm cho vay lãi nặng dán tờ rơi khắp cột điện trong khu phố, có người vay rồi bị nhắn tin đe doạ đòi nợ.', 'Có nhóm cho vay lãi nặng dán tờ rơi khắp cột điện trong khu phố, có người vay rồi bị nhắn tin đe doạ đòi nợ.', 'important', 'received', 0, 11.0110758, 106.651874, DATE_SUB(NOW(), INTERVAL 49 DAY)),
('SC7QDQ', 1, 8, 'Gần đây khu tôi mất trộm mấy chiếc xe đạp và đồ để ngoài sân. Nghi có người lạ đi dò la ban ngày.', 'Gần đây khu tôi mất trộm mấy chiếc xe đạp và đồ để ngoài sân. Nghi có người lạ đi dò la ban ngày.', 'normal', 'received', 1, 11.0202245, 106.6628582, DATE_SUB(NOW(), INTERVAL 4 DAY)),
('PKRED6', 1, 6, 'Một hộ trong hẻm tự ý câu điện từ trụ công cộng về xưởng nhỏ, dây điện chằng chịt sát mặt đường rất nguy hiểm.', 'Một hộ trong hẻm tự ý câu điện từ trụ công cộng về xưởng nhỏ, dây điện chằng chịt sát mặt đường rất nguy hiểm.', 'important', 'processing', 1, 11.01085, 106.6452809, DATE_SUB(NOW(), INTERVAL 49 DAY)),
('UWZGX5', 1, 2, 'Tôi phát hiện có người rao bán giấy tờ giả trong nhóm mạng xã hội của khu dân cư, có kèm số điện thoại liên hệ.', 'Tôi phát hiện có người rao bán giấy tờ giả trong nhóm mạng xã hội của khu dân cư, có kèm số điện thoại liên hệ.', 'urgent', 'processing', 1, 11.0106982, 106.6498955, DATE_SUB(NOW(), INTERVAL 33 DAY)),
('SGLTR4', 1, 7, 'Xe tải chở vật liệu xây dựng chạy ban đêm không che chắn, làm rơi vãi đất đá khắp mặt đường, nghi khai thác trái phép.', 'Xe tải chở vật liệu xây dựng chạy ban đêm không che chắn, làm rơi vãi đất đá khắp mặt đường, nghi khai thác trái phép.', 'important', 'received', 1, 11.0187836, 106.6353968, DATE_SUB(NOW(), INTERVAL 5 DAY)),
('BDRTSD', 1, 4, 'Có người lạ thường xuyên chụp ảnh nhà dân trong hẻm rồi bỏ đi, bà con thấy bất thường nên muốn báo.', 'Có người lạ thường xuyên chụp ảnh nhà dân trong hẻm rồi bỏ đi, bà con thấy bất thường nên muốn báo.', 'normal', 'resolved', 1, 11.0204546, 106.6568922, DATE_SUB(NOW(), INTERVAL 49 DAY)),
('RCKATQ', 1, 7, 'Một điểm kinh doanh trong khu phố bán hàng không rõ nguồn gốc, nghi là hàng giả nhãn hiệu.', 'Một điểm kinh doanh trong khu phố bán hàng không rõ nguồn gốc, nghi là hàng giả nhãn hiệu.', 'important', 'processing', 0, 11.0188051, 106.6407127, DATE_SUB(NOW(), INTERVAL 46 DAY)),
('YYHR77', 1, 6, 'Tối qua có tiếng cãi vã và đập phá đồ đạc trong một căn nhà ở hẻm, tôi lo có bạo lực gia đình nhưng ngại sang can.', 'Tối qua có tiếng cãi vã và đập phá đồ đạc trong một căn nhà ở hẻm, tôi lo có bạo lực gia đình nhưng ngại sang can.', 'urgent', 'received', 0, 11.0101623, 106.637849, DATE_SUB(NOW(), INTERVAL 23 DAY)),
('5ZYNR8', 1, 5, 'Tôi nghi có người lợi dụng danh nghĩa quyên góp từ thiện để thu tiền của bà con trong khu phố.', 'Tôi nghi có người lợi dụng danh nghĩa quyên góp từ thiện để thu tiền của bà con trong khu phố.', 'normal', 'received', 0, 11.0261941, 106.6404054, DATE_SUB(NOW(), INTERVAL 52 DAY)),
('T387KH', 1, 1, 'Có nhóm thanh niên hay lạng lách nẹt pô vào buổi tối trên tuyến đường chính, đã suýt va quệt người đi đường.', 'Có nhóm thanh niên hay lạng lách nẹt pô vào buổi tối trên tuyến đường chính, đã suýt va quệt người đi đường.', 'important', 'processing', 0, 11.0162631, 106.6440609, DATE_SUB(NOW(), INTERVAL 39 DAY)),
('FJ78K3', 1, 1, 'Một số tài khoản mạng xã hội giả danh trang của công an phường để đăng tin, bà con dễ nhầm.', 'Một số tài khoản mạng xã hội giả danh trang của công an phường để đăng tin, bà con dễ nhầm.', 'normal', 'processing', 1, 11.0200839, 106.6471912, DATE_SUB(NOW(), INTERVAL 36 DAY)),
('HATNZ9', 2, 5, 'Tôi nộp hồ sơ xin xác nhận cư trú đã hơn hai tuần nhưng chưa nhận được kết quả, đi hỏi thì được bảo tiếp tục chờ.', 'Tôi nộp hồ sơ xin xác nhận cư trú đã hơn hai tuần nhưng chưa nhận được kết quả, đi hỏi thì được bảo tiếp tục chờ.', 'important', 'processing', 0, 11.027043, 106.6507588, DATE_SUB(NOW(), INTERVAL 15 DAY)),
('Q72EMW', 2, 2, 'Tôi khiếu nại về việc bị thu phí không có biên lai khi làm thủ tục tại một điểm dịch vụ.', 'Tôi khiếu nại về việc bị thu phí không có biên lai khi làm thủ tục tại một điểm dịch vụ.', 'normal', 'resolved', 0, 11.0170311, 106.654482, DATE_SUB(NOW(), INTERVAL 7 DAY)),
('7BYSNB', 2, 5, 'Hồ sơ đăng ký tạm trú của tôi bị trả lại hai lần mà không nêu rõ thiếu giấy tờ gì.', 'Hồ sơ đăng ký tạm trú của tôi bị trả lại hai lần mà không nêu rõ thiếu giấy tờ gì.', 'normal', 'processing', 0, 11.0255323, 106.6474926, DATE_SUB(NOW(), INTERVAL 17 DAY)),
('X35HNQ', 2, 1, 'Tôi phản ánh thái độ tiếp dân chưa đúng mực của một nhân viên tại điểm tiếp nhận hồ sơ.', 'Tôi phản ánh thái độ tiếp dân chưa đúng mực của một nhân viên tại điểm tiếp nhận hồ sơ.', 'important', 'processing', 0, 11.0213668, 106.6422503, DATE_SUB(NOW(), INTERVAL 35 DAY)),
('2PBFQP', 2, 2, 'Tôi đã nộp lệ phí nhưng chưa nhận được giấy hẹn trả kết quả, mong được kiểm tra lại.', 'Tôi đã nộp lệ phí nhưng chưa nhận được giấy hẹn trả kết quả, mong được kiểm tra lại.', 'normal', 'processing', 0, 11.0097984, 106.6576921, DATE_SUB(NOW(), INTERVAL 38 DAY)),
('S5QR6F', 3, 2, 'Đèn đường đoạn qua cầu bị hỏng hơn hai tuần, tối đi lại rất nguy hiểm, đã có người té xe.', 'Đèn đường đoạn qua cầu bị hỏng hơn hai tuần, tối đi lại rất nguy hiểm, đã có người té xe.', 'important', 'resolved', 0, 11.0193474, 106.654961, DATE_SUB(NOW(), INTERVAL 48 DAY)),
('EREVTE', 3, 7, 'Bãi rác tự phát ven đường ngày càng lớn, mùi hôi ảnh hưởng tới các hộ xung quanh, mong được xử lý.', 'Bãi rác tự phát ven đường ngày càng lớn, mùi hôi ảnh hưởng tới các hộ xung quanh, mong được xử lý.', 'normal', 'processing', 0, 11.0174385, 106.6388247, DATE_SUB(NOW(), INTERVAL 46 DAY)),
('WLZR5K', 3, 8, 'Đề nghị lắp thêm camera ở ngã ba gần trường học vì hay có xe chạy ẩu giờ tan trường.', 'Đề nghị lắp thêm camera ở ngã ba gần trường học vì hay có xe chạy ẩu giờ tan trường.', 'normal', 'received', 0, 11.0175679, 106.6675656, DATE_SUB(NOW(), INTERVAL 5 DAY)),
('JWZK9V', 3, 1, 'Quán karaoke mở nhạc quá lớn tới một hai giờ sáng, cả khu phố không ngủ được, đã nhắc nhiều lần.', 'Quán karaoke mở nhạc quá lớn tới một hai giờ sáng, cả khu phố không ngủ được, đã nhắc nhiều lần.', 'important', 'processing', 0, 11.0142521, 106.6428563, DATE_SUB(NOW(), INTERVAL 10 DAY)),
('TH6GS3', 3, 4, 'Đường vào hẻm có nhiều ổ gà lớn, mùa mưa đọng nước, xe máy hay bị ngã.', 'Đường vào hẻm có nhiều ổ gà lớn, mùa mưa đọng nước, xe máy hay bị ngã.', 'normal', 'received', 0, 11.0251858, 106.6552426, DATE_SUB(NOW(), INTERVAL 10 DAY)),
('ZLPE5C', 3, 8, 'Chó thả rông nhiều, có trường hợp cắn người đi đường, mong nhắc nhở các hộ nuôi.', 'Chó thả rông nhiều, có trường hợp cắn người đi đường, mong nhắc nhở các hộ nuôi.', 'normal', 'resolved', 0, 11.0154733, 106.6665022, DATE_SUB(NOW(), INTERVAL 27 DAY)),
('WCS6NN', 3, 4, 'Người bán hàng rong lấn hết vỉa hè trước cổng trường, học sinh phải đi xuống lòng đường.', 'Người bán hàng rong lấn hết vỉa hè trước cổng trường, học sinh phải đi xuống lòng đường.', 'important', 'processing', 0, 11.0225671, 106.6651887, DATE_SUB(NOW(), INTERVAL 24 DAY)),
('5GVZ37', 3, 3, 'Nắp cống trên tuyến đường chính bị vỡ đã lâu chưa thay, ban đêm rất nguy hiểm.', 'Nắp cống trên tuyến đường chính bị vỡ đã lâu chưa thay, ban đêm rất nguy hiểm.', 'normal', 'processing', 0, 11.0079672, 106.6548967, DATE_SUB(NOW(), INTERVAL 34 DAY)),
('YZULP2', 3, 3, 'Công trình xây dựng tập kết vật liệu chiếm nửa lòng đường, gây ùn tắc giờ cao điểm.', 'Công trình xây dựng tập kết vật liệu chiếm nửa lòng đường, gây ùn tắc giờ cao điểm.', 'important', 'resolved', 0, 11.01072, 106.6516473, DATE_SUB(NOW(), INTERVAL 39 DAY)),
('4GSS4M', 3, 7, 'Cây xanh trước nhà tôi cành đã mục, sợ gãy đổ trúng người khi mưa gió.', 'Cây xanh trước nhà tôi cành đã mục, sợ gãy đổ trúng người khi mưa gió.', 'normal', 'resolved', 0, 11.0206968, 106.6415531, DATE_SUB(NOW(), INTERVAL 56 DAY)),
('6E2YYM', 3, 4, 'Nhiều hộ đốt rác trong khu dân cư gây khói mù, ảnh hưởng người già và trẻ nhỏ.', 'Nhiều hộ đốt rác trong khu dân cư gây khói mù, ảnh hưởng người già và trẻ nhỏ.', 'normal', 'resolved', 0, 11.0239521, 106.6637232, DATE_SUB(NOW(), INTERVAL 29 DAY)),
('THUBHQ', 3, 1, 'Xe ô tô đậu tràn lan hai bên đường hẹp khiến xe cứu thương khó vào được hẻm.', 'Xe ô tô đậu tràn lan hai bên đường hẹp khiến xe cứu thương khó vào được hẻm.', 'important', 'received', 0, 11.0233194, 106.6473921, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('XXM4Z7', 3, 3, 'Loa phát thanh khu phố bị rè, bà con nghe không rõ nội dung thông báo.', 'Loa phát thanh khu phố bị rè, bà con nghe không rõ nội dung thông báo.', 'normal', 'processing', 0, 11.0030627, 106.6539928, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('ETBLQ3', 3, 2, 'Mong bố trí thêm thùng rác công cộng ở khu vực chợ vì hiện quá ít.', 'Mong bố trí thêm thùng rác công cộng ở khu vực chợ vì hiện quá ít.', 'normal', 'received', 0, 11.0078708, 106.6530269, DATE_SUB(NOW(), INTERVAL 9 DAY)),
('QXPJHY', 3, 2, 'Dây cáp viễn thông sà xuống thấp ngang đầu người ở một đoạn hẻm, rất dễ vướng.', 'Dây cáp viễn thông sà xuống thấp ngang đầu người ở một đoạn hẻm, rất dễ vướng.', 'important', 'processing', 0, 11.0101578, 106.6479282, DATE_SUB(NOW(), INTERVAL 28 DAY)),
('24HJH5', 3, 8, 'Đề nghị sơn lại vạch kẻ đường và gờ giảm tốc trước cổng trường tiểu học.', 'Đề nghị sơn lại vạch kẻ đường và gờ giảm tốc trước cổng trường tiểu học.', 'normal', 'resolved', 0, 11.0111324, 106.6621072, DATE_SUB(NOW(), INTERVAL 11 DAY)),
('J86N25', 3, 1, 'Chợ tự phát họp dưới lòng đường vào buổi sáng gây cản trở giao thông.', 'Chợ tự phát họp dưới lòng đường vào buổi sáng gây cản trở giao thông.', 'normal', 'resolved', 0, 11.0170611, 106.6432212, DATE_SUB(NOW(), INTERVAL 32 DAY)),
('EKPD59', 3, 6, 'Có hộ xả nước thải chưa xử lý ra rãnh chung, gây mùi nồng nặc cả khu.', 'Có hộ xả nước thải chưa xử lý ra rãnh chung, gây mùi nồng nặc cả khu.', 'important', 'processing', 0, 11.0057327, 106.6466055, DATE_SUB(NOW(), INTERVAL 46 DAY)),
('X4UB98', 3, 5, 'Mong tổ chức thêm buổi sinh hoạt cho thanh thiếu niên vào dịp hè.', 'Mong tổ chức thêm buổi sinh hoạt cho thanh thiếu niên vào dịp hè.', 'normal', 'resolved', 0, 11.0358623, 106.6513384, DATE_SUB(NOW(), INTERVAL 36 DAY)),
('PRW26P', 3, 1, 'Bảng tên khu phố bị mờ và ngã đổ, người lạ tới tìm địa chỉ rất khó.', 'Bảng tên khu phố bị mờ và ngã đổ, người lạ tới tìm địa chỉ rất khó.', 'normal', 'processing', 0, 11.0157238, 106.647976, DATE_SUB(NOW(), INTERVAL 51 DAY)),
('K4KR56', 4, 8, 'Xin hỏi thủ tục đăng ký tạm trú cho người ở tỉnh khác tới làm việc cần giấy tờ gì ạ?', 'Xin hỏi thủ tục đăng ký tạm trú cho người ở tỉnh khác tới làm việc cần giấy tờ gì ạ?', 'normal', 'resolved', 0, 11.0163598, 106.6589683, DATE_SUB(NOW(), INTERVAL 57 DAY)),
('2NB4U3', 4, 1, 'Đề nghị mở thêm buổi tuyên truyền phòng chống lừa đảo qua điện thoại cho người lớn tuổi trong khu phố.', 'Đề nghị mở thêm buổi tuyên truyền phòng chống lừa đảo qua điện thoại cho người lớn tuổi trong khu phố.', 'normal', 'resolved', 0, 11.0238035, 106.6459045, DATE_SUB(NOW(), INTERVAL 24 DAY)),
('TWBMP5', 4, 3, 'Tôi muốn hỏi cách làm căn cước cho cháu vừa đủ mười bốn tuổi, cần mang theo giấy tờ nào?', 'Tôi muốn hỏi cách làm căn cước cho cháu vừa đủ mười bốn tuổi, cần mang theo giấy tờ nào?', 'normal', 'resolved', 0, 11.0142913, 106.6536262, DATE_SUB(NOW(), INTERVAL 14 DAY)),
('DXBTYS', 4, 1, 'Đề xuất đặt bảng thông báo số điện thoại trực ban ở nhà văn hoá khu phố để bà con tiện gọi khi cần.', 'Đề xuất đặt bảng thông báo số điện thoại trực ban ở nhà văn hoá khu phố để bà con tiện gọi khi cần.', 'normal', 'received', 0, 11.021792, 106.6426493, DATE_SUB(NOW(), INTERVAL 48 DAY)),
('UDWM47', 4, 4, 'Xin hướng dẫn thủ tục khai báo tạm vắng khi tôi đi làm xa dài ngày.', 'Xin hướng dẫn thủ tục khai báo tạm vắng khi tôi đi làm xa dài ngày.', 'normal', 'resolved', 0, 11.0186452, 106.6646545, DATE_SUB(NOW(), INTERVAL 35 DAY)),
('2U49JX', 4, 5, 'Đề nghị công khai lịch tiếp công dân định kỳ để bà con chủ động sắp xếp thời gian.', 'Đề nghị công khai lịch tiếp công dân định kỳ để bà con chủ động sắp xếp thời gian.', 'normal', 'received', 0, 11.0262849, 106.6499209, DATE_SUB(NOW(), INTERVAL 23 DAY)),
('TZPAAW', 4, 4, 'Tôi muốn biết cách đăng ký thường trú khi vừa mua nhà trong khu phố.', 'Tôi muốn biết cách đăng ký thường trú khi vừa mua nhà trong khu phố.', 'normal', 'processing', 0, 11.0266507, 106.6631077, DATE_SUB(NOW(), INTERVAL 28 DAY)),
('ZUCB2T', 4, 8, 'Đề xuất lập nhóm liên lạc của khu phố để thông báo nhanh tình hình an ninh.', 'Đề xuất lập nhóm liên lạc của khu phố để thông báo nhanh tình hình an ninh.', 'normal', 'processing', 0, 11.0137447, 106.6656131, DATE_SUB(NOW(), INTERVAL 35 DAY)),
('BVMJXB', 4, 6, 'Xin hỏi làm lại căn cước bị mất thì mất bao lâu và cần chuẩn bị gì?', 'Xin hỏi làm lại căn cước bị mất thì mất bao lâu và cần chuẩn bị gì?', 'normal', 'received', 0, 11.0100151, 106.6476636, DATE_SUB(NOW(), INTERVAL 9 DAY)),
('Q659Z6', 4, 4, 'Đề nghị tăng cường tuần tra ban đêm ở khu vực có nhiều nhà trọ.', 'Đề nghị tăng cường tuần tra ban đêm ở khu vực có nhiều nhà trọ.', 'normal', 'received', 0, 11.0206548, 106.6585433, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('GVXW7G', 1, 2, 'Khoảng 22 giờ tối qua, tôi thấy nhóm khoảng năm sáu thanh niên tụ tập phía sau dãy nhà trọ, có biểu hiện mua bán chất cấm. Họ đi ba xe máy, một chiếc màu đỏ không gắn biển số.', 'Khoảng 22 giờ tối qua, tôi thấy nhóm khoảng năm sáu thanh niên tụ tập phía sau dãy nhà trọ, có biểu hiện mua bán chất cấm. Họ đi ba xe máy, một chiếc màu đỏ không gắn biển số.', 'urgent', 'resolved', 0, 11.0177376, 106.6577126, DATE_SUB(NOW(), INTERVAL 28 DAY)),
('JAZM7U', 1, 8, 'Căn nhà cho thuê cạnh nhà tôi thường xuyên có người lạ ra vào lúc nửa đêm, mỗi lần chỉ vài phút rồi đi ngay. Tôi nghi có mua bán ma tuý, xin được giấu tên.', 'Căn nhà cho thuê cạnh nhà tôi thường xuyên có người lạ ra vào lúc nửa đêm, mỗi lần chỉ vài phút rồi đi ngay. Tôi nghi có mua bán ma tuý, xin được giấu tên.', 'urgent', 'processing', 1, 11.0191012, 106.6635147, DATE_SUB(NOW(), INTERVAL 23 DAY)),
('SRS2DJ', 1, 4, 'Có một quán trong khu phố tổ chức đánh bài ăn tiền gần như mỗi tối, đông người tụ tập tới khuya gây mất trật tự.', 'Có một quán trong khu phố tổ chức đánh bài ăn tiền gần như mỗi tối, đông người tụ tập tới khuya gây mất trật tự.', 'important', 'resolved', 1, 11.0290849, 106.6564274, DATE_SUB(NOW(), INTERVAL 58 DAY)),
('2C394R', 1, 3, 'Tôi nhận cuộc gọi tự xưng cán bộ công an, đọc đúng họ tên tôi rồi yêu cầu chuyển tiền để chứng minh trong sạch. Tôi chưa chuyển nhưng muốn báo để bà con khác cảnh giác.', 'Tôi nhận cuộc gọi tự xưng cán bộ công an, đọc đúng họ tên tôi rồi yêu cầu chuyển tiền để chứng minh trong sạch. Tôi chưa chuyển nhưng muốn báo để bà con khác cảnh giác.', 'urgent', 'processing', 0, 11.0104059, 106.6598866, DATE_SUB(NOW(), INTERVAL 57 DAY)),
('2FVNWW', 1, 4, 'Có nhóm cho vay lãi nặng dán tờ rơi khắp cột điện trong khu phố, có người vay rồi bị nhắn tin đe doạ đòi nợ.', 'Có nhóm cho vay lãi nặng dán tờ rơi khắp cột điện trong khu phố, có người vay rồi bị nhắn tin đe doạ đòi nợ.', 'important', 'processing', 0, 11.0303006, 106.6559705, DATE_SUB(NOW(), INTERVAL 49 DAY)),
('6LDMPA', 1, 5, 'Gần đây khu tôi mất trộm mấy chiếc xe đạp và đồ để ngoài sân. Nghi có người lạ đi dò la ban ngày.', 'Gần đây khu tôi mất trộm mấy chiếc xe đạp và đồ để ngoài sân. Nghi có người lạ đi dò la ban ngày.', 'normal', 'processing', 0, 11.0322603, 106.6480905, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('VX3WFX', 1, 6, 'Một hộ trong hẻm tự ý câu điện từ trụ công cộng về xưởng nhỏ, dây điện chằng chịt sát mặt đường rất nguy hiểm.', 'Một hộ trong hẻm tự ý câu điện từ trụ công cộng về xưởng nhỏ, dây điện chằng chịt sát mặt đường rất nguy hiểm.', 'important', 'processing', 0, 11.0029766, 106.6450241, DATE_SUB(NOW(), INTERVAL 17 DAY)),
('H5QEBW', 1, 2, 'Tôi phát hiện có người rao bán giấy tờ giả trong nhóm mạng xã hội của khu dân cư, có kèm số điện thoại liên hệ.', 'Tôi phát hiện có người rao bán giấy tờ giả trong nhóm mạng xã hội của khu dân cư, có kèm số điện thoại liên hệ.', 'urgent', 'resolved', 1, 11.0160472, 106.6569592, DATE_SUB(NOW(), INTERVAL 52 DAY)),
('Y492PY', 1, 4, 'Xe tải chở vật liệu xây dựng chạy ban đêm không che chắn, làm rơi vãi đất đá khắp mặt đường, nghi khai thác trái phép.', 'Xe tải chở vật liệu xây dựng chạy ban đêm không che chắn, làm rơi vãi đất đá khắp mặt đường, nghi khai thác trái phép.', 'important', 'received', 1, 11.0265665, 106.6565649, DATE_SUB(NOW(), INTERVAL 54 DAY)),
('9K3W6N', 1, 5, 'Có người lạ thường xuyên chụp ảnh nhà dân trong hẻm rồi bỏ đi, bà con thấy bất thường nên muốn báo.', 'Có người lạ thường xuyên chụp ảnh nhà dân trong hẻm rồi bỏ đi, bà con thấy bất thường nên muốn báo.', 'normal', 'processing', 1, 11.0295278, 106.6405076, DATE_SUB(NOW(), INTERVAL 27 DAY)),
('AVNY4C', 1, 3, 'Một điểm kinh doanh trong khu phố bán hàng không rõ nguồn gốc, nghi là hàng giả nhãn hiệu.', 'Một điểm kinh doanh trong khu phố bán hàng không rõ nguồn gốc, nghi là hàng giả nhãn hiệu.', 'important', 'processing', 0, 11.0116367, 106.6530673, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('JKNC8D', 1, 1, 'Tối qua có tiếng cãi vã và đập phá đồ đạc trong một căn nhà ở hẻm, tôi lo có bạo lực gia đình nhưng ngại sang can.', 'Tối qua có tiếng cãi vã và đập phá đồ đạc trong một căn nhà ở hẻm, tôi lo có bạo lực gia đình nhưng ngại sang can.', 'urgent', 'resolved', 1, 11.0164864, 106.649237, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('UPXRR8', 1, 5, 'Tôi nghi có người lợi dụng danh nghĩa quyên góp từ thiện để thu tiền của bà con trong khu phố.', 'Tôi nghi có người lợi dụng danh nghĩa quyên góp từ thiện để thu tiền của bà con trong khu phố.', 'normal', 'received', 0, 11.0352547, 106.6439679, DATE_SUB(NOW(), INTERVAL 58 DAY)),
('REC2U4', 1, 3, 'Có nhóm thanh niên hay lạng lách nẹt pô vào buổi tối trên tuyến đường chính, đã suýt va quệt người đi đường.', 'Có nhóm thanh niên hay lạng lách nẹt pô vào buổi tối trên tuyến đường chính, đã suýt va quệt người đi đường.', 'important', 'received', 1, 11.0136724, 106.6587575, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('UCE7XL', 1, 1, 'Một số tài khoản mạng xã hội giả danh trang của công an phường để đăng tin, bà con dễ nhầm.', 'Một số tài khoản mạng xã hội giả danh trang của công an phường để đăng tin, bà con dễ nhầm.', 'normal', 'received', 1, 11.0200246, 106.642097, DATE_SUB(NOW(), INTERVAL 10 DAY)),
('RMRYM9', 2, 2, 'Tôi nộp hồ sơ xin xác nhận cư trú đã hơn hai tuần nhưng chưa nhận được kết quả, đi hỏi thì được bảo tiếp tục chờ.', 'Tôi nộp hồ sơ xin xác nhận cư trú đã hơn hai tuần nhưng chưa nhận được kết quả, đi hỏi thì được bảo tiếp tục chờ.', 'important', 'processing', 0, 11.0160207, 106.6510593, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('QKGH8X', 2, 2, 'Tôi khiếu nại về việc bị thu phí không có biên lai khi làm thủ tục tại một điểm dịch vụ.', 'Tôi khiếu nại về việc bị thu phí không có biên lai khi làm thủ tục tại một điểm dịch vụ.', 'normal', 'received', 0, 11.0105271, 106.6562149, DATE_SUB(NOW(), INTERVAL 10 DAY)),
('B2TRX9', 2, 1, 'Hồ sơ đăng ký tạm trú của tôi bị trả lại hai lần mà không nêu rõ thiếu giấy tờ gì.', 'Hồ sơ đăng ký tạm trú của tôi bị trả lại hai lần mà không nêu rõ thiếu giấy tờ gì.', 'normal', 'received', 0, 11.0185658, 106.6495933, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('YUJAQR', 2, 1, 'Tôi phản ánh thái độ tiếp dân chưa đúng mực của một nhân viên tại điểm tiếp nhận hồ sơ.', 'Tôi phản ánh thái độ tiếp dân chưa đúng mực của một nhân viên tại điểm tiếp nhận hồ sơ.', 'important', 'received', 0, 11.0155248, 106.6465302, DATE_SUB(NOW(), INTERVAL 36 DAY)),
('4KPT27', 2, 3, 'Tôi đã nộp lệ phí nhưng chưa nhận được giấy hẹn trả kết quả, mong được kiểm tra lại.', 'Tôi đã nộp lệ phí nhưng chưa nhận được giấy hẹn trả kết quả, mong được kiểm tra lại.', 'normal', 'resolved', 0, 11.0097316, 106.6563946, DATE_SUB(NOW(), INTERVAL 54 DAY)),
('XCGHM8', 3, 6, 'Đèn đường đoạn qua cầu bị hỏng hơn hai tuần, tối đi lại rất nguy hiểm, đã có người té xe.', 'Đèn đường đoạn qua cầu bị hỏng hơn hai tuần, tối đi lại rất nguy hiểm, đã có người té xe.', 'important', 'resolved', 0, 11.0044413, 106.643663, DATE_SUB(NOW(), INTERVAL 50 DAY)),
('X273TV', 3, 1, 'Bãi rác tự phát ven đường ngày càng lớn, mùi hôi ảnh hưởng tới các hộ xung quanh, mong được xử lý.', 'Bãi rác tự phát ven đường ngày càng lớn, mùi hôi ảnh hưởng tới các hộ xung quanh, mong được xử lý.', 'normal', 'resolved', 0, 11.0234643, 106.6505091, DATE_SUB(NOW(), INTERVAL 53 DAY)),
('6M549R', 3, 7, 'Đề nghị lắp thêm camera ở ngã ba gần trường học vì hay có xe chạy ẩu giờ tan trường.', 'Đề nghị lắp thêm camera ở ngã ba gần trường học vì hay có xe chạy ẩu giờ tan trường.', 'normal', 'processing', 0, 11.026113, 106.6407022, DATE_SUB(NOW(), INTERVAL 54 DAY)),
('RN8THN', 3, 2, 'Quán karaoke mở nhạc quá lớn tới một hai giờ sáng, cả khu phố không ngủ được, đã nhắc nhiều lần.', 'Quán karaoke mở nhạc quá lớn tới một hai giờ sáng, cả khu phố không ngủ được, đã nhắc nhiều lần.', 'important', 'received', 0, 11.0135367, 106.6464265, DATE_SUB(NOW(), INTERVAL 60 DAY)),
('ZJJGJ8', 3, 3, 'Đường vào hẻm có nhiều ổ gà lớn, mùa mưa đọng nước, xe máy hay bị ngã.', 'Đường vào hẻm có nhiều ổ gà lớn, mùa mưa đọng nước, xe máy hay bị ngã.', 'normal', 'processing', 0, 11.0030323, 106.6603589, DATE_SUB(NOW(), INTERVAL 10 DAY)),
('XLEG2P', 3, 3, 'Chó thả rông nhiều, có trường hợp cắn người đi đường, mong nhắc nhở các hộ nuôi.', 'Chó thả rông nhiều, có trường hợp cắn người đi đường, mong nhắc nhở các hộ nuôi.', 'normal', 'resolved', 0, 11.0115442, 106.6540153, DATE_SUB(NOW(), INTERVAL 15 DAY)),
('XLTBAZ', 3, 5, 'Người bán hàng rong lấn hết vỉa hè trước cổng trường, học sinh phải đi xuống lòng đường.', 'Người bán hàng rong lấn hết vỉa hè trước cổng trường, học sinh phải đi xuống lòng đường.', 'important', 'processing', 0, 11.0319049, 106.6462127, DATE_SUB(NOW(), INTERVAL 51 DAY)),
('9TUMNT', 3, 1, 'Nắp cống trên tuyến đường chính bị vỡ đã lâu chưa thay, ban đêm rất nguy hiểm.', 'Nắp cống trên tuyến đường chính bị vỡ đã lâu chưa thay, ban đêm rất nguy hiểm.', 'normal', 'processing', 0, 11.0136767, 106.6496148, DATE_SUB(NOW(), INTERVAL 59 DAY)),
('VHRWGH', 3, 2, 'Công trình xây dựng tập kết vật liệu chiếm nửa lòng đường, gây ùn tắc giờ cao điểm.', 'Công trình xây dựng tập kết vật liệu chiếm nửa lòng đường, gây ùn tắc giờ cao điểm.', 'important', 'received', 0, 11.0083173, 106.6541644, DATE_SUB(NOW(), INTERVAL 11 DAY)),
('AUN3A6', 3, 4, 'Cây xanh trước nhà tôi cành đã mục, sợ gãy đổ trúng người khi mưa gió.', 'Cây xanh trước nhà tôi cành đã mục, sợ gãy đổ trúng người khi mưa gió.', 'normal', 'received', 0, 11.0240303, 106.6659896, DATE_SUB(NOW(), INTERVAL 46 DAY));

-- Đánh dấu là dữ liệu thử để sau này xoá cho dễ
UPDATE submissions SET original_content = CONCAT(original_content, ' [MAU THU]');


-- ---------------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY
-- ---------------------------------------------------------------------------
SELECT w.name AS khu_pho, COUNT(s.id) AS so_tin,
       SUM(s.category_id = 1) AS to_giac,
       SUM(s.urgency = 'urgent') AS khan_cap,
       SUM(s.status = 'resolved') AS da_giai_quyet
  FROM wards w LEFT JOIN submissions s ON s.ward_id = w.id
 GROUP BY w.id, w.name ORDER BY so_tin DESC;

SELECT COUNT(*) AS tong_y_kien FROM submissions;
SELECT `key`, `value` FROM system_settings WHERE `key` = 'site_name';
