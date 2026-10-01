# ADR 003 — Hai cấp vai trò, bỏ cấp độ bảo mật, luồng sàng lọc

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-01
- **Người quyết định**: Loc (người vận hành). Claude nêu từng chỗ đảo ngược ADR 002 kèm rủi ro, Loc xác nhận từng điểm
- **Thay thế**: [ADR 002](002-mo-hinh-vai-tro-cap-xa.md) mục 1, 2, 3 và 4. Mục 5 (hàng chờ tin ẩn danh) và mục 6 (quy tắc vận hành) vẫn giữ, trừ chỗ mâu thuẫn với ADR này
- **Liên quan**: [ADR 001](001-pham-vi-du-lieu-theo-don-vi.md) (một đơn vị, một database)

---

## Bối cảnh

Người vận hành lập kế hoạch nâng cấp trang cán bộ gồm 28 việc: hàng sàng lọc, tách tin tố
giác, tin trùng, phần ngoài thẩm quyền, nhật ký mọi hoạt động… Bốn việc trong đó đảo ngược
quyết định của ADR 002 và phần chính sách của bản vá BUG-009 (đã RETEST `Fixed` ở P45).
Trước khi viết mã, phiên này hỏi lại từng điểm, nói rõ điều ADR 002 cố ý chặn. Loc giữ
nguyên kế hoạch ở ba điểm và chọn phương án hẹp hơn ở một điểm (mã thiết bị).

## Quyết định

### 1. Hai cấp vai trò

| Vai trò | Ai | Giá trị `staff.role` |
|---|---|---|
| **Lãnh đạo** | Trưởng và Phó trưởng | `admin`, `manager` |
| **Cán bộ** | Các cán bộ, chiến sĩ còn lại | `handler` |

- Lãnh đạo **toàn quyền**. `admin` và `manager` có quyền như nhau; giao diện gọi chung là
  "Lãnh đạo".
- Không đổi ENUM `staff.role`, không migration vai trò. Tạo tài khoản lãnh đạo mới thì dùng `admin`.
- Mọi chốt quyền nằm ở backend, đọc từ một danh sách duy nhất (`server/src/lib/vai-tro.js`).

### 2. Quyền của cán bộ

Cán bộ làm mọi việc xử lý tin: sàng lọc, xử lý, tin trùng, ghi chú, trao đổi với người dân.
Cán bộ **không** được:

- xem danh tính người gửi (tên, số điện thoại, email);
- đọc phần Tin tố giác mật và phần Ngoài thẩm quyền;
- xem hoặc xuất nhật ký;
- xuất Excel;
- quản lý tài khoản, tin tức, mã QR, điểm đen, từ cấm.

### 3. Danh tính

Mọi lãnh đạo xem được danh tính của mọi tin có danh tính, **không cần được giao hồ sơ**. Mỗi
lượt xem ghi nhật ký trước khi trả dữ liệu. Cán bộ không bao giờ xem được.

### 4. Bỏ hẳn ba cấp độ bảo mật

Bỏ ô chọn và cột nghiệp vụ Thường / Cần bảo vệ / Mật. Thay bằng hai cờ trên hồ sơ, đọc qua
**cùng một lớp phạm vi** đã có (`server/src/lib/pham-vi-ho-so.js`). Mọi route đang gọi lớp đó
giữ nguyên chỗ gọi; chỉ luật bên trong đổi.

| Cờ | Ý nghĩa | Ai thấy |
|---|---|---|
| `to_giac_mat` | Tin tố cáo cán bộ, người làm việc trong cơ quan nhà nước, chính quyền. Hệ thống tự gắn bằng bộ từ khoá lúc nhận tin; cán bộ chuyển tin vào được, không chuyển ra được | Chỉ lãnh đạo |
| `ngoai_tham_quyen` | Tin cán bộ sàng lọc đánh dấu ngoài thẩm quyền | Chỉ lãnh đạo |

Khi nâng cấp CSDL, hồ sơ đang ở mức **Mật hoặc Cần bảo vệ** (kể cả giá trị lạ) chuyển thành
`to_giac_mat = 1`. Không hồ sơ nào đang được che bị lộ ra cho cán bộ trong lúc chuyển đổi.

### 5. Phân công

Lãnh đạo giao hồ sơ cho bất kỳ ai. Bỏ luật "Phó chỉ giao cho cán bộ" (BUG-008): luật đó tồn
tại vì phân công từng mở cửa xem danh tính, nay danh tính không còn đi theo phân công.

### 6. Mã thiết bị

Tin **có danh tính** thiếu mã thiết bị hợp lệ thì bị từ chối. Tin **ẩn danh** giữ nguyên:
không gửi, không lưu mã thiết bị. Không đụng vùng của phần lõi BUG-017 đang mở.

### 7. Sáu điểm kế hoạch từng để ngỏ

Người vận hành đã chốt cả sáu điểm: năm điểm theo phương án đề xuất trong kế hoạch, điểm 3 theo cách riêng.

1. Tin ẩn danh vẫn qua hàng kiểm duyệt ẩn danh hiện có. Tin có danh tính vào hàng sàng lọc.
2. Khoá theo địa chỉ mạng đã bỏ ở BUG-016. Trang danh sách khoá giữ phần khoá thiết bị, thiết
   bị tin cậy và khiếu nại mở khoá.
3. Hàng sàng lọc có **hai** nút bỏ tin: "Tin rác" **vẫn khoá máy** theo cách của BUG-018 (dùng chung
   đường `/mark-spam` với bảng xử lý, không chép lại luật khoá); "Tin giả" chỉ bỏ vào thùng rác,
   không khoá. Vì vẫn còn khoá, màn hình "Tạm dừng tiếp nhận" bên người dân giữ nguyên.
   *(Người vận hành chốt sau khi triển khai; bản đầu chỉ có nút "Tin giả" ở hàng sàng lọc.)*
4. Hạn 72 giờ người dân bổ sung thông tin tính từ lúc gửi.
5. Cổng xác minh khi vào web dùng Cloudflare Turnstile (chỉ đổi vị trí); máy chủ cấp vé có thời
   hạn và kiểm vé ở mọi lần gửi tin, đăng nhập.
6. Tin tố giác sau khi xác nhận vào phần Tin tố giác riêng.

## Rủi ro chấp nhận

Ghi lại để người sau không tưởng là sơ suất. Đây là những điều ADR 002 cố ý chặn:

| Rủi ro | Giảm thiểu còn lại |
|---|---|
| Một tố giác nhắm vào Phó trưởng: Phó đọc được, vì là lãnh đạo | Nhật ký ghi mọi lượt mở tin tố giác mật và mọi lượt xem danh tính; Trưởng đọc nhật ký; nhật ký không ai sửa xoá được |
| Số người biết danh tính người báo tăng từ một (Trưởng) lên số lãnh đạo | Như trên; mỗi lượt xem ghi nhật ký trước khi trả dữ liệu |
| Không còn ai ngoài lãnh đạo đọc nhật ký, nên lãnh đạo chỉ kiểm được lẫn nhau | Nhật ký chỉ ghi thêm, ghi cả lượt mở và xuất nhật ký |
| Cán bộ đang được giao một hồ sơ mức Cần bảo vệ mất quyền đọc sau nâng cấp | Tệp nâng cấp in danh sách hồ sơ đó để lãnh đạo xử lý hoặc chuyển ra |

## Hệ quả

- Phần chính sách của bản vá BUG-009 (ai đọc mức nào) bị thay. Cơ chế một chỗ kiểm và mọi chỗ gọi
  nó được giữ.
- Các test khoá hành vi của ADR 002, BUG-008 và BUG-009 phải viết lại theo ADR này. Commit nào
  sửa kỳ vọng test thì ghi rõ lý do, không sửa lặng lẽ.
- Theo luật 8, sau khi xong cần một phiên `RETEST` độc lập cho lớp phạm vi hồ sơ, danh tính và
  phân công theo ADR này.
- Chuyển sang nhiều đơn vị dùng chung một database thì xem lại ADR này cùng ADR 001.

## Ghi chú triển khai (P46)

Những chỗ kế hoạch chưa nói rõ, phiên triển khai đã chọn như sau — ghi lại để người sau không tưởng là sơ suất:

| Chỗ | Đã chọn | Vì sao |
|---|---|---|
| Trạng thái `received` | Nay nghĩa là "chờ sàng lọc", chỉ cho tin có danh tính. Duyệt tin ẩn danh đưa thẳng vào `processing`; `nang_cap_v28.sql` chuyển tin ẩn danh đã duyệt cũ | Không thêm giá trị ENUM mới (phải sửa cả thủ tục CSDL và bảng lịch sử) |
| Tin tố giác mật bắt dư | Lãnh đạo được đưa tin ra; cán bộ chỉ chuyển vào | Bộ từ khoá cố ý bắt dư; không có đường ra thì tin thường kẹt ở phần chỉ lãnh đạo |
| Lý do "Tin giả" | Ghi vào ghi chú nội bộ; người dân tra cứu chỉ thấy lời chung có 113 | Lý do của cán bộ ("nghi bịa đặt") là nội bộ |
| Tin tố giác bị đánh tin giả | Không tự xoá sau 7 ngày trong thùng rác, chờ lãnh đạo | Một lần bấm không được làm mất tố giác thật |
| Việc cần ghi nhật ký TRƯỚC | Xem danh tính, mở tin chỉ lãnh đạo xem, mở/xuất nhật ký, xuất dữ liệu, xoá vĩnh viễn: ghi không được thì không làm | Không có lớp nào khác đứng giữa lãnh đạo với các việc này |
| Nhãn "gần như giống hệt" ở Tin trùng | Chỉ so nội dung, không dùng mã máy hay mạng | Nhãn theo máy nối được tin ẩn danh với tin có tên (BUG-014) |
| Cảnh báo đột biến với cán bộ | Chỉ hiện khi riêng số tin cán bộ xem được đã chạm ngưỡng | Ngưỡng là số công khai; hiện cảnh báo dưới ngưỡng là lộ có tin bị ẩn (BUG-009) |
| Vé cổng vào | JWT 6 giờ, không gắn địa chỉ mạng; chưa khai `TURNSTILE_SECRET_KEY` thì không bắt vé | 4G đổi IP liên tục; giữ hành vi cũ khi chưa khai khoá |
| Chống chụp màn hình | Chữ chìm, làm mờ, chặn in/sao chép, ghi nhật ký phím chụp | Trang web không chặn tuyệt đối được — mục tiêu là răn đe và truy vết |
