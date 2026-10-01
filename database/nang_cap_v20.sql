-- ============================================================================
-- NÂNG CẤP V20 — DỌN MÃ HỒ SƠ KHỎI LÝ DO DỌN THEO LÔ VÀ LÝ DO KHOÁ (DỮ LIỆU CŨ)
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
-- VÌ SAO (BUG-014, SEC-DEC-005):
-- Trước bản vá 69e8c00, bấm "Tin rác" ở một hồ sơ thì máy chủ:
--   · dọn theo lô MỌI đơn cùng máy trong 24 giờ, KHÔNG phân biệt ẩn danh hay
--     có tên, và ghi vào từng đơn bị cuốn: "Dọn theo lô cùng thiết bị với hồ sơ <mã>";
--   · ghi lý do khoá: "Tin rác — hồ sơ <mã>...".
-- Một tố giác ẩn danh bị cuốn theo đơn có tên của cùng người gửi vì thế mang
-- mã hồ sơ của đơn có tên đó, và trang chi tiết trả lý do này cho MỌI cán bộ.
-- Khôi phục khỏi thùng rác KHÔNG xoá lý do, nên mối nối này sống mãi trên đơn
-- đã khôi phục. Mã máy chủ mới không ghi mã hồ sơ nữa; tệp này dọn phần đã ghi.
--
-- Bỏ mã hồ sơ thôi CHƯA ĐỦ — việc đơn từng bị cuốn theo lô tự nó đã là dấu vết:
--   · /review cũ ghi "…một tin bị đánh dấu rác ở hàng chờ" — không có mã, nhưng
--     nói thủ phạm nằm ở hàng chờ, nơi gần như toàn đơn ẩn danh. Đơn CÓ TÊN mang
--     chuỗi này = có tố giác ẩn danh cùng máy bị rác trong 24 giờ trước đó.
--   · Đơn ẨN DANH đã khôi phục mà còn ghi "dọn theo lô", cộng cửa sổ 24 giờ, là
--     lần ra đơn có tên gây dọn khi ít sự kiện rác.
-- Nên:
--   · Đơn ĐÃ KHÔI PHỤC: xoá hẳn lý do dọn. Cán bộ đã quyết định đơn không phải
--     rác, ghi chú "vì sao từng vào thùng rác" đã lỗi thời. Không đảo ngược được.
--   · Đơn CÒN trong thùng rác: đưa mọi chuỗi dọn về MỘT chuỗi chung (cán bộ vẫn
--     biết vì sao nó ở đó để quyết khôi phục). Tự xoá hẳn sau tối đa 7 ngày.
-- Tệp này không xoá được mọi dấu vết của dữ liệu cũ; phần còn lại là rủi ro đã
-- biết, theo dõi ở BUG-017 (chi tiết chỉ nằm trong buglogs/, không ở đây).
-- KHÔNG gỡ is_spam của đơn đã khôi phục để "dọn cho sạch": đó là chốt "một đơn
-- chỉ gây khoá một lần" của BUG-015.
--
-- Chỉ đụng chuỗi do MÁY CHỦ tự ghi (khớp theo đầu chuỗi), không đụng lý do cán bộ
-- gõ tay. Lý do khoá cũ bị thay cả phần cán bộ gõ sau mã hồ sơ: tách riêng phần
-- đó không đáng, vì dòng khoá cũ (loai_don = 'khong_ro' sau v19) không chặn gì và
-- tự hết hạn trong tối đa 30 ngày.
--
-- NÊN SAO LƯU TRƯỚC KHI CHẠY. Không đảo ngược được — đó chính là mục đích.
--
-- CHẠY: HeidiSQL -> chọn đúng database -> dán toàn bộ -> F9
-- Chạy lại nhiều lần không báo lỗi, không đổi thêm gì. Không phụ thuộc v19.
-- ============================================================================


-- ⚠️ updated_at = updated_at KHÔNG THỪA. Cột này là ON UPDATE CURRENT_TIMESTAMP:
-- bỏ dòng đó thì mọi đơn bị sửa mang CÙNG giờ chạy tệp này — tự nó thành một dấu
-- "từng bị cuốn theo lô" mới, gom được theo giây ở trang chi tiết. Gán tường minh
-- thì MySQL giữ nguyên giá trị cũ.
--
-- Mọi chuỗi dọn theo lô máy chủ từng ghi đều bắt đầu bằng một trong hai tiền tố:
--   'Dọn theo lô cùng thiết bị với …'   (mark-spam, review — cũ lẫn mới)
--   'Dọn theo lô: cùng thiết bị với …'  (mặc định trong lib/chan-spam.js)

-- 1a. Đơn ĐÃ KHÔI PHỤC — xoá hẳn lý do dọn
UPDATE submissions
   SET rejection_reason = NULL,
       updated_at = updated_at
 WHERE deleted_at IS NULL
   AND (rejection_reason LIKE 'Dọn theo lô cùng thiết bị với %'
     OR rejection_reason LIKE 'Dọn theo lô: cùng thiết bị với %');

-- 1b. Đơn CÒN trong thùng rác — một chuỗi chung, không nói đường dọn hay hồ sơ gây dọn
UPDATE submissions
   SET rejection_reason = 'Dọn theo lô cùng thiết bị với một hồ sơ bị đánh dấu tin rác',
       updated_at = updated_at
 WHERE deleted_at IS NOT NULL
   AND (rejection_reason LIKE 'Dọn theo lô cùng thiết bị với %'
     OR rejection_reason LIKE 'Dọn theo lô: cùng thiết bị với %');

-- 2. Lý do khoá (khoá thiết bị và khoá địa chỉ mạng)
UPDATE blacklists
   SET reason = 'Tin rác'
 WHERE reason LIKE 'Tin rác — hồ sơ %';


-- Kiểm lại: cả ba số phải bằng 0
SELECT COUNT(*) AS don_khoi_phuc_con_dau_don_theo_lo
  FROM submissions
 WHERE deleted_at IS NULL
   AND (rejection_reason LIKE 'Dọn theo lô cùng thiết bị với %'
     OR rejection_reason LIKE 'Dọn theo lô: cùng thiết bị với %');
SELECT COUNT(*) AS don_trong_thung_rac_khac_chuoi_chung
  FROM submissions
 WHERE deleted_at IS NOT NULL
   AND (rejection_reason LIKE 'Dọn theo lô cùng thiết bị với %'
     OR rejection_reason LIKE 'Dọn theo lô: cùng thiết bị với %')
   AND rejection_reason <> 'Dọn theo lô cùng thiết bị với một hồ sơ bị đánh dấu tin rác';
SELECT COUNT(*) AS khoa_con_tro_ma_ho_so
  FROM blacklists WHERE reason LIKE 'Tin rác — hồ sơ %';
