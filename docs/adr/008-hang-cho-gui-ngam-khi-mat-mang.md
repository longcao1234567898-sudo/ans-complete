# ADR 008 — Mất mạng vẫn gửi được: hàng chờ mã hoá trên máy, có mạng thì tự gửi

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-25
- **Người quyết định**: người vận hành, phiên P92 ("mất mạng vẫn gửi được và khi bấm gửi thì đảm bảo
  nó chạy ngầm gặp mạng gửi ngay")
- **Liên quan**: P91 (máy chủ nhận ra lần gửi lại — `server/src/lib/lan-gui.js`), ND-076 (ràng buộc
  cho hàng chờ), ADR-003 việc 28 (trang dự phòng 113), ADR-007 (ô chống máy tự động)

---

## Bối cảnh

Người dân ở vùng sóng yếu bấm "Gửi" lúc mất mạng thì trước đây chỉ thấy báo lỗi và phải điền lại.
Tệ hơn: mạng đứt ĐÚNG lúc máy chủ đã lưu mà chưa kịp trả lời thì người dân mất mã tra cứu và PIN
phòng trao đổi. P91 đã giải phần máy chủ: mỗi lần gửi mang `maLanGui`, gửi lại cùng mã trả lại đúng
mã tra cứu và PIN, không tạo đơn trùng.

Tin chờ gửi là **danh tính người tố giác nằm trên máy người dân** — chính tài sản cần bảo vệ nhất.

## Quyết định

1. **Khi nào cất:** máy báo mất mạng lúc bấm Gửi; hoặc không tới được máy chủ / máy chủ lỗi 5xx /
   trang lỗi không phải của máy chủ (có thể đã lưu mà chưa trả lời). Máy chủ trả lời có lý do (4xx)
   thì KHÔNG cất — báo ngay như cũ.
2. **Cất gì, cất ở đâu:** NGUYÊN thân yêu cầu đã chuẩn bị (kể cả `maLanGui`, ảnh đã chuẩn bị) trong
   IndexedDB `htans-hang-cho`, mã hoá AES-GCM 256 bằng khoá sinh trong trình duyệt, **không xuất
   được** (`extractable = false`). Không cất mã Turnstile một lần (`xacMinhThem`). Tối đa 3 tin.
3. **Không hiện lại nội dung:** giao diện chỉ báo "có N tin chờ", trạng thái và nút "Xoá tin chờ".
4. **Tự gửi:** khi trang đang mở (sự kiện có mạng — thử ngay và thêm hai lần ngắn — và cứ 20 giây),
   khi mở lại trang, và trên trình duyệt có Background Sync (Android/Chrome) cả khi đã đóng trang
   (`public/sw.js`). Một lượt một lúc giữa các tab và service worker (Web Locks, khoá `gui-tin-cho`).
5. **Vé "không phải người máy":** tin cất lúc chưa có vé thì khi có mạng máy chủ trả `CAN_XAC_MINH`;
   thanh tin chờ hiện ô xác minh ngay tại trang đang mở. Vé không nằm trong dấu vân của lần gửi nên
   thay được giữa các lần thử. Ở bước 3, mất mạng thì cho đi tiếp (ghi chú "sẽ nhắc xác minh khi có
   mạng") — chặn thật vẫn ở máy chủ (luật 2).
6. **Gửi được:** cất mã tra cứu + PIN (cũng mã hoá) TRƯỚC, xoá tin SAU; hiện hộp mã tra cứu tới khi
   người dân bấm "Tôi đã lưu mã" thì xoá nốt.
7. **Mã trạng thái:** 200/201 nhận; 403 `CAN_XAC_MINH`, 429 `CAN_XAC_MINH_THEM` cần người dân xác
   minh; 409 `DANG_GUI`, 429 khác, 5xx, không tới được: thử lại sau; còn lại (400, 409
   `LAN_GUI_KHAC`…) là từ chối hẳn — báo lý do, không gửi nữa, người dân xoá.
8. **Mất mạng mà mở trang:** service worker lưu bản ứng dụng lần cuối mở được và trả nó cho mọi điều
   hướng khi mất mạng; chưa từng lưu thì về trang dự phòng 113 như cũ (ADR-003 việc 28).
9. **React Query:** lệnh gửi ý kiến và lệnh phân tích nội dung đặt `networkMode: 'always'` — mặc định
   thư viện tạm dừng lệnh khi mất mạng, nút Gửi đứng im.

## Đánh đổi đã chấp nhận

- **Người cầm chính máy, chính trình duyệt đó** dùng được khoá (khoá không xuất ra được nhưng trình
  duyệt vẫn giải mã cho trang cùng nguồn). Mã hoá chống sao chép thư mục dữ liệu trình duyệt, không
  chống người mở trình duyệt. Vì vậy giao diện không bao giờ hiện lại nội dung, và có nút xoá.
- **iPhone/Safari không có Background Sync:** chỉ gửi khi trang đang mở hoặc mở lại. Màn hình "đã lưu
  trên máy" nói rõ việc khẩn cấp đừng chờ — gọi 113.
- **Bản ứng dụng lưu sẵn có thể cũ** tới lần mở trang có mạng kế tiếp (lúc có mạng luôn lấy bản mới).
- Xoá dữ liệu trang web / duyệt ẩn danh rồi đóng thì tin chờ mất — tin chưa tới máy chủ, không lộ gì.
