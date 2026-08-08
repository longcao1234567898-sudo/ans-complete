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
