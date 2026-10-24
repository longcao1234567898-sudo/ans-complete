# ADR 006 — Chống spam nhiều lớp: chặn mềm theo mạng, KHÔNG dùng dấu vân tay trình duyệt

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-24
- **Người quyết định**: người vận hành đưa đề xuất "giăng lưới 3 lớp" (cookie định danh + dấu vân
  tay trình duyệt + giới hạn theo IP/dải /64, xác minh Turnstile từ tin thứ 2, khoá cứng ở tin thứ 5)
  và bảo "tham khảo và làm". Claude đối chiếu với mô hình đe doạ của dự án, làm phần hợp, ghi lại phần
  không làm và vì sao (phiên P88)
- **Liên quan**: ADR-003 §6 (mã thiết bị), BUG-014 (không đọc mã máy của tin ẩn danh), P87 (IPv6 gom
  /64), P86 (bộ đếm atomic `lib/dem-gioi-han.js`), `routes/submissions.js`

---

## Bối cảnh

Web không bắt đăng nhập, HTTP không giữ trạng thái — người cố tình xoá dữ liệu trình duyệt, mở tab ẩn
danh, đổi mạng là "người mới". Đề xuất 3 lớp nhằm khoá mốc 1 giờ cho chắc.

**Nhưng tài sản cần bảo vệ nhất của hệ thống là danh tính người tố giác** (CLAUDE.md). Mọi thứ giúp
"nhận ra lại một máy dù đã xoá sạch dấu vết" cũng chính là thứ giúp **nối một tin ẩn danh với người
gửi**. Đó là lý do dự án đã cố ý **không đọc mã thiết bị của tin ẩn danh** (BUG-014) và **không lưu IP
thô** (chỉ lưu băm).

Đo được trước khi quyết (P83, mô hình 18.000 ý kiến/ngày, luật giới hạn hiện có): trên 4G dùng chung
IP, số người **bị chặn oan** tăng mạnh khi nhiều người chung một IP — đáng lo nhất là luật "2 tin ẩn
danh/ngày/mạng" chặn người tố giác thật đi chung mạng với người lạ.

## Đối chiếu từng lớp của đề xuất

| Lớp đề xuất | Hệ thống đã có | Quyết định |
|---|---|---|
| **1. Mã định danh UUID** trong cookie `HttpOnly; Secure; SameSite=Strict` | Mã thiết bị (UUID) do trình duyệt sinh, gửi kèm **chỉ với tin có danh tính**; nút "Tin rác" khoá đúng máy đó (ADR-003 §6) | **Giữ cách cũ, không chuyển sang cookie.** Cookie được trình duyệt **tự gửi kèm mọi yêu cầu** — kể cả tin ẩn danh — tức máy chủ sẽ nhận mã máy của người tố giác ẩn danh, ngược BUG-014. Mã này không phải bí mật (không mở được gì), nên lợi ích "chống XSS lấy trộm" của HttpOnly gần như bằng không; xoá cookie cũng dễ như xoá localStorage |
| **2. Dấu vân tay trình duyệt** (Canvas, WebGL, font, Audio…) | Không có | **KHÔNG LÀM.** (a) Sinh ra đúng thứ mô hình đe doạ #2 cần: cán bộ tha hoá so "vân tay" tin ẩn danh với tin có tên là ra người tố giác — kể cả khi người đó dùng tab ẩn danh, đổi mạng. (b) Thu thập âm thầm đặc điểm thiết bị là xử lý dữ liệu cá nhân không có đồng ý (Luật Bảo vệ dữ liệu cá nhân 2025). (c) Trên điện thoại kém chính xác: hàng nghìn máy cùng đời, cùng hệ điều hành ra cùng vân tay → chặn oan hàng loạt; kẻ viết bot thì giả vân tay dễ dàng — đúng như chính đề xuất thừa nhận ở lớp 3 |
| **3. Giới hạn theo IP; IPv6 theo dải /64** | Có: chờ 2 phút / 5 tin/giờ / 2 tin ẩn danh/ngày theo mạng; IPv6 gom /64 từ P87 | **Giữ, và làm "chặn mềm"** (dưới đây) |
| **Xác minh Turnstile khi vượt ngưỡng, khoá cứng ở mức cao** | Turnstile là cổng vào (vé 6 giờ), vượt ngưỡng thì chặn thẳng | **LÀM** — phần đáng giá nhất của đề xuất |
| **Bộ đếm Redis: kiểm rồi `INCR`** | Đếm bằng MySQL, giữ chỗ theo khoá (`lib/giu-cho-gui.js`), bộ đếm `UPDATE` có điều kiện (`lib/dem-gioi-han.js`) | **Không thêm Redis.** "Kiểm rồi mới cộng" là hai bước — gửi dồn song song lọt qua (luật 6). Cách đang dùng đã atomic và không cần thêm một dịch vụ phải vận hành, sao lưu, bảo mật |

## Quyết định — chặn mềm theo mạng (P88)

1. **Theo SỐ ĐIỆN THOẠI: giữ CỨNG.** Cùng một số là cùng một người — chờ 2 phút, tối đa 5 tin/giờ,
   xác minh thêm không mở được.
2. **Theo MẠNG (IP; IPv6 dải /64): MỀM.** Vượt ngưỡng (chờ 2 phút / 10 phút với ẩn danh, 5 tin/giờ,
   2 tin ẩn danh/ngày) thì máy chủ trả `429` mã `CAN_XAC_MINH_THEM`; trang hiện ô Turnstile ngay trên
   đơn đang điền (không mất đơn), lấy **mã tươi** gửi lại trong trường riêng `xacMinhThem`.
3. **Mã tươi kiểm NGHIÊM NGẶT** (`xacMinhNghiemNgat`): dùng một lần (Cloudflare tự từ chối lần hai);
   Cloudflare không trả lời thì **không cho qua** — khác cổng vào chung (cho qua khi lỗi mạng để không
   chặn cả hệ thống).
4. **Trần cứng theo mạng:** 20 tin/giờ; ẩn danh 6 tin/ngày — tới trần thì xác minh thêm cũng không mở.
5. **Chưa bật Turnstile thì không có lối mở thêm:** ngưỡng mạng cứng như cũ (fail-safe, luật 1).

## Đánh đổi đã chấp nhận

- Người dùng chung 4G phải bấm thêm một ô xác minh khi mạng đông — đổi lấy việc không bị chặn oan.
- Kẻ thuê dịch vụ giải CAPTCHA vẫn qua được tới trần cứng (20 tin/giờ/mạng, 6 tin ẩn danh/ngày/mạng);
  sau đó vẫn còn: chặn trùng nội dung, khoá máy khi cán bộ đánh "Tin rác", sàng lọc.
- Không nhận ra lại được kẻ phá đã xoá sạch trình duyệt và đổi mạng. Đây là cái giá **cố ý trả** để
  không bao giờ nhận ra lại được người tố giác.

## Không làm (ghi để người sau khỏi làm lại)

- Không thêm dấu vân tay trình duyệt, kể cả "chỉ cho tin có danh tính": cùng một đoạn mã chạy trên
  trang gửi tin ẩn danh, và vân tay đã thu thì luôn có thể bị đem đi so.
- Không đặt cookie định danh cho người dân.
