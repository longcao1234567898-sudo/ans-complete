-- ============================================================================
-- THÊM TIN MỚI — DÙNG ĐỂ THỬ TÍNH NĂNG TIN TỨC
-- ============================================================================
--
-- Tệp này chèn 2 bản tin cảnh giác lừa đảo mới (tháng 8/2026) để thử:
--   • Nhãn "MỚI" (tin trong 48 giờ) — tin số 1 đăng hôm nay nên sẽ có nhãn đỏ
--   • Bộ lọc "Hôm nay" và "Trong tuần"
--   • Nút chia sẻ Zalo
--   • Đếm lượt xem (nếu đã chạy nang_cap_v15.sql)
--
-- CÁCH CHẠY: mở HeidiSQL → chọn đúng database → dán toàn bộ tệp này → F9.
--
-- GHI CHÚ: category dùng mã trong database, KHÔNG phải mã hiển thị:
--   security = An ninh trật tự   |   warning  = Cảnh giác
--   guide    = Hướng dẫn thủ tục |   document = Văn bản mới
-- ============================================================================

INSERT INTO news (title, summary, category, image_url, source_name, source_url, published_at, is_published) VALUES

-- ══════════ TIN 1 — đăng HÔM NAY (để thử nhãn "MỚI" và lọc "Hôm nay") ══════════
('Cảnh báo: kẻ gian chiếm tài khoản Zalo, Facebook rồi giả danh chính chủ hỏi vay tiền',
 'Công an xã Khánh Hưng (tỉnh Cà Mau) cảnh báo một thủ đoạn đang lan rộng: thay vì dựng kịch bản lừa phức tạp, kẻ gian tìm cách chiếm quyền điều khiển tài khoản Zalo, Facebook, Telegram của người dân. Khi đã kiểm soát được tài khoản, chúng đóng vai chính chủ nhắn cho người thân, bạn bè trong danh bạ, viện lý do gấp gáp để hỏi vay hoặc nhờ chuyển tiền. Vì tin nhắn đến từ đúng tài khoản người quen nên nhiều người mất cảnh giác. Bà con lưu ý: nhận được tin nhắn hỏi vay tiền, dù từ tài khoản người thân, hãy gọi điện thoại trực tiếp xác minh trước khi chuyển bất kỳ khoản nào.',
 'warning', '/media/bg-lang-noi.webp', 'cafef.vn',
 'https://cafef.vn/cong-an-thong-bao-toi-tat-ca-nhung-ai-nhan-tin-nhan-zalo-messenger-co-noi-dung-sau-18826082406055387.chn',
 CURDATE(), TRUE),

-- ══════════ TIN 2 — đăng 3 ngày trước (để thử lọc "Trong tuần") ══════════
('Cảnh giác thủ đoạn gửi "Giấy mời" giả mạo cơ quan nhà nước về thủ tục đất đai',
 'Xuất hiện thủ đoạn lừa đảo mới liên quan tới thủ tục đất đai: kẻ gian tự làm giả "Giấy mời" mang danh Ủy ban nhân dân hoặc cơ quan quản lý đất đai, rồi mang trực tiếp tới nhà người dân hoặc phát tán qua tin nhắn Zalo, Facebook. Mục đích là tạo lòng tin để dẫn dụ người dân làm theo hướng dẫn, cung cấp thông tin cá nhân hoặc chuyển tiền. Bà con nhận được giấy mời hoặc tin nhắn kiểu này nên mang tới trụ sở công an, ủy ban xã để xác minh, tuyệt đối không làm theo hướng dẫn qua điện thoại hay mạng xã hội.',
 'warning', '/media/bg-nui-cam.webp', 'cafebiz.vn',
 'https://cafebiz.vn/cong-an-canh-bao-chieu-thuc-lua-dao-moi-lien-quan-thu-tuc-dat-dai-176260812185256904.chn',
 CURDATE() - INTERVAL 3 DAY, TRUE);

-- ============================================================================
-- KIỂM TRA SAU KHI CHẠY — chạy riêng câu dưới để xem tin đã vào chưa
-- ============================================================================
SELECT id, title, category, published_at, is_published
  FROM news
 ORDER BY published_at DESC, id DESC
 LIMIT 5;
