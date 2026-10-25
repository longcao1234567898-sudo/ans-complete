# ADR 007 — Ô chống máy tự động ở bước chọn nhóm, không chặn cả web lúc vào

- **Trạng thái**: Đã chấp nhận — thay mục 5 của ADR-003 (vị trí ô xác minh)
- **Ngày**: 2026-10-25
- **Người quyết định**: người vận hành, phiên P90 ("đặt một bộ chống bot Turnstile ở chỗ chọn lựa
  chọn 1 trong 4 loại tin", rồi "làm cái 2. chuyển ô chống máy tự động")
- **Liên quan**: ADR-003 mục 5 (cổng xác minh khi vào web), ADR-006 (xác minh thêm khi mạng đông),
  `server/src/lib/cong-vao.js` (vé), P89 (mã xác minh số đòi vé)

---

## Bối cảnh

Từ ADR-003, ai mở web cũng gặp ngay màn hình Turnstile chặn cả trang, kể cả người chỉ đọc tin tức,
tra cứu kết quả hay xem bản đồ. Người vận hành muốn người dân chỉ xác minh khi thật sự sắp gửi tin,
đúng ở bước chọn 1 trong 4 nhóm. Bước điền thông tin liên hệ để dành cho số điện thoại và mã Zalo.

Màn hình chặn cả trang **không phải một lớp bảo vệ** (CLAUDE.md luật 2): máy tự động gọi thẳng API,
không mở trang. Lớp chặn thật là **máy chủ đòi vé** ở ba chỗ: gửi ý kiến (`routes/submissions.js`),
gửi mã xác minh số (`routes/xac-minh-sdt.js`), đăng nhập (`routes/auth.js`).

## Quyết định

1. **Máy chủ không đổi.** Vẫn đòi vé ở ba chỗ trên; vé vẫn sống 6 giờ.
2. **Người dân:** ô Turnstile nằm ở **bước 3 — chọn nhóm** của trang gửi ý kiến
   (`FeedbackForm/OXacMinhNguoiMay.tsx`). Nút "Tiếp tục" mở khi đã chọn nhóm VÀ đã có vé. Đã có vé
   còn hạn (trong 6 giờ) thì chỉ hiện dòng "Đã xác minh". Các trang khác không còn bị chặn.
3. **Vé hết hạn lúc bấm gửi:** máy chủ trả `CAN_XAC_MINH`. Trang hiện ô "Xác minh lại một lần" ngay
   trên đơn; xác minh xong thì đơn tự gửi tiếp, không phải điền lại.
4. **Cán bộ:** trang đăng nhập giữ màn hình xác minh riêng (`common/CongVao.tsx`, giờ chỉ bọc
   `/dang-nhap`).

## Đánh đổi đã chấp nhận

- Bot đọc được các trang công khai mà không vướng Turnstile. Các trang đó vốn công khai, máy chủ
  không đòi vé, và màn hình cũ cũng không cản được bot gọi thẳng API.
- Người không qua được Turnstile (máy cũ, mạng chặn Cloudflare) bị kẹt ở bước 3 thay vì ở cửa web:
  vẫn đọc được trang, và ô xác minh luôn hiện số 113 và số trực ban.
