# Kế hoạch kiểm thử bảo mật & chất lượng — Hộp Thư An Ninh Số

> **Phạm vi:** tự kiểm toán hệ thống của chính đơn vị mình, chạy nội bộ trước khi release.
> Không nhắm vào bất kỳ hệ thống nào của bên khác.
>
> **Cách hiểu cụm "vượt qua giới hạn backend"** trong toàn bộ tài liệu này: viết test case
> **xác nhận giới hạn KHÔNG bị lách** (kiểm thử phòng thủ). Test phải chạy trên môi trường
> `local`/`staging` với dữ liệu giả, không bao giờ chạy lên production đang phục vụ dân.

## 1. Vì sao cần đợt kiểm thử này

Codebase phần lớn do AI sinh ra. Bốn nhóm rủi ro đặc trưng của code AI:

| Rủi ro | Biểu hiện thường gặp trong dự án này |
|---|---|
| Xác thực/phân quyền không nhất quán | Có `requireAuth` ở router cha nhưng thiếu `authorize(...)` ở từng route con |
| Validate input thiếu | Tin frontend đã chặn (`src/utils/security.ts`) nên backend bỏ qua kiểm tra lại |
| Lộ endpoint nội bộ | Endpoint sinh ra để chẩn đoán lúc phát triển — hữu ích khi debug, cần khoá lại ở production |
| Business logic chưa nghĩ kỹ | Giới hạn đếm bằng `SELECT` rồi `INSERT` (không atomic) → lách được bằng race-condition |

**Rủi ro thứ năm, quan trọng nhất với đợt này:** chính AI khi *sửa* lỗi cũng có thể tạo
lỗ hổng mới, sửa sai chỗ, hoặc vá triệu chứng chứ không vá gốc rễ. Vì vậy **Giai đoạn 4
(retest độc lập) là bắt buộc**, và người/AI đã fix **không được** tự đóng lỗi của mình.

## 2. Đang ở đâu, việc tiếp theo là gì

> **Bảng lịch 12 ngày làm việc (D1–D12, 10/09 → 25/09) đã được gỡ bỏ ngày 2026-09-23.**
> Nó giả định mỗi ngày xong một giai đoạn. Thực tế: 13 ngày được 3 phiên, và cả 3 phải làm
> lại vì chạy trên một bản mã đã lỗi thời. Giữ một cái lịch mà ai cũng biết là sai thì tệ
> hơn là không có lịch. Thay bằng **mốc theo phiên**, vì phiên mới là đơn vị thực thi thật.

**Nguồn sự thật về tiến độ là [TIEN-DO.md](../TIEN-DO.md), không phải tệp này.**
Tệp này chỉ nói đợt audit gồm những giai đoạn nào và đang ở giai đoạn nào.

| Giai đoạn | Tình trạng | Việc |
|---|---|---|
| **GĐ0 — Gỡ hai ẩn số** | ⏳ Chưa bắt đầu | Hai phiên `RETEST`: một cho BUG-001, một cho BUG-003. Mỗi phiên là một **cửa sổ Claude mới** |
| **GĐ1 — Kiểm kê** | ⚠️ Phải làm lại | Kiểm kê trên mã đã hợp nhất, kèm bề mặt tấn công mới |
| **GĐ2 — Rà soát 8 nhóm** | ⚠️ Phải làm lại | Tám phiên `/phien-ra-soat` |
| **GĐ3 — Fix** | ⏳ Chưa bắt đầu | Số phiên tuỳ số lỗi. `/phien-fix BUG-xxx` |
| **GĐ4 — Retest độc lập** | ⏳ Chưa bắt đầu | Mỗi BUG một cửa sổ Claude mới |
| **GĐ5 — Báo cáo** | ⏳ Chưa bắt đầu | Một phiên `TAI-LIEU` |

### Việc tiếp theo, cụ thể

**Mở một cửa sổ Claude hoàn toàn mới rồi gõ `/phien-retest BUG-001`.**

Vì sao là việc này chứ không phải kiểm kê lại: BUG-001 mức `Critical` đang **không rõ trạng
thái**. Một thay đổi nhắm vào chuyện khác có thể đã chặn nó như tác dụng phụ, và chưa ai xác
minh. Không nên bỏ công kiểm kê endpoint trong khi chưa biết người ngoài có đọc được danh
tính người tố giác hay không. Việc này cũng rẻ: script kiểm chứng đã có sẵn.

Vì sao phải là cửa sổ mới: xem [QUY-TRINH-LAM-VIEC.md §2.1](../QUY-TRINH-LAM-VIEC.md).

**Điều kiện thoát của cả đợt** (không đổi):
- Không còn lỗi `Critical` hoặc `High` ở trạng thái mở hoặc không rõ.
- Mọi lỗi đã đóng đều có kết quả retest do **người/AI khác với người fix** ghi nhận.
- Mọi fix `Critical`/`High` đều có một Security Decision Log tương ứng.
- `cd server && npm test` xanh toàn bộ; `npm run build` không lỗi TypeScript.

## 3. Bản đồ thư mục này

Ba thư mục con chia theo **loại nội dung**: `phuong-phap/` dạy cách làm, `bieu-mau/` là
form trống để điền, `ket-qua/` là sản phẩm từng phiên đã làm ra.

> ⚠️ Hai tệp trong `ket-qua/` (`kiem-ke-endpoint.md`, `luong-du-lieu-nhay-cam.md`) là sản
> phẩm của phiên P01 và P02, **làm trên mã đã lỗi thời**. Đọc để tham khảo cách trình bày,
> đừng tin nội dung cho tới khi GĐ1 làm lại xong.

| File | Nội dung |
|---|---|
| [phuong-phap/1-kiem-ke.md](phuong-phap/1-kiem-ke.md) | Kiểm kê endpoint, luồng dữ liệu, giới hạn nghiệp vụ |
| [phuong-phap/2-ra-soat.md](phuong-phap/2-ra-soat.md) | Checklist rà soát 8 nhóm hạng mục |
| [phuong-phap/3-fix.md](phuong-phap/3-fix.md) | Quy trình fix theo ưu tiên, kỷ luật commit |
| [phuong-phap/4-retest.md](phuong-phap/4-retest.md) | Retest độc lập — nguyên tắc và checklist |
| [phuong-phap/5-bao-cao.md](phuong-phap/5-bao-cao.md) | Tổng hợp báo cáo, cấu trúc slide |
| [bieu-mau/bug-log.md](bieu-mau/bug-log.md) | Mẫu Bug Log + thang đánh giá mức độ |
| [bieu-mau/security-decision-log.md](bieu-mau/security-decision-log.md) | Mẫu Security Decision Log |
| [phuong-phap/bo-test-phong-thu.md](phuong-phap/bo-test-phong-thu.md) | Bộ test xác nhận giới hạn không bị lách |
| [phuong-phap/cong-cu.md](phuong-phap/cong-cu.md) | SAST/DAST/dependency scan — lệnh chạy cụ thể |
| [KE-HOACH.md](KE-HOACH.md) | **Kế hoạch đang chạy** — bẻ từng giai đoạn thành phiên Claude, kèm vùng mã mới phải phủ |

Nhật ký lỗi và nhật ký quyết định nằm ở thư mục `buglogs/`.

> ⚠️ **`buglogs/` không có trên GitHub — đây là chủ ý, không phải thiếu file.**
> Thư mục đó chứa lỗ hổng **chưa vá** của một hệ thống giữ dữ liệu tố giác tội phạm; đưa lên
> repo công khai là đưa bản đồ tấn công cho người ngoài. Cùng nguyên tắc đã áp dụng cho tài
> liệu phân tích đợt vá 2026-08-03 (xem [CHANGELOG-BAO-MAT.md](../CHANGELOG-BAO-MAT.md)).
>
> Phần **phương pháp** (thư mục này) công khai vì nó không chứa lỗ hổng sống. Mọi liên kết
> trỏ sang `buglogs/` bên dưới chỉ hoạt động trên máy có bản nội bộ.
>
> Quy tắc kèm theo: tài liệu công khai chỉ nhắc **mã** `BUG-xxx`, không mô tả lỗ hổng đang mở.

## 4. Nguyên tắc xuyên suốt

1. **Không tin mô tả "đã fix xong"** — chỉ tin kết quả chạy lại đúng kịch bản khai thác gốc.
2. **Mỗi lỗi Critical = một commit riêng.** Gộp commit làm mất khả năng truy vết khi AI sửa lan sang chỗ khác.
3. **Đối chiếu đa nguồn.** Kết luận của AI phải được đối chiếu với ít nhất một công cụ tự động (Semgrep / `npm audit` / ZAP) hoặc một lần đọc diff thủ công.
4. **Fail-safe, không fail-open.** Nguyên tắc này đã có sẵn trong dự án (thiếu khoá bí mật → server từ chối khởi động); mọi fix mới phải giữ đúng tinh thần đó.
5. **Ghi lại cả thứ không fix.** Rủi ro chấp nhận (accepted risk) cũng phải có dòng trong báo cáo, kèm lý do và kế hoạch xử lý sau.

## 5. Bối cảnh hệ thống (tóm tắt cho người đọc mới)

- **Frontend:** React 18 + TypeScript + Vite, chạy được offline bằng `localStorage`.
- **Backend:** Node/Express + MySQL (`server/`), JWT + bcryptjs + helmet + express-rate-limit.
- **Dữ liệu nhạy cảm:** nội dung tố giác, danh tính người tố giác (mã hoá at-rest), ảnh/video bằng chứng, email/SĐT (băm HMAC + pepper).
- **Mô hình đe doạ chính:** (a) người ngoài đọc trộm danh tính người tố giác; (b) **cán bộ tha hoá** tra danh tính hồ sơ mình không phụ trách; (c) spam/bot làm nghẽn kênh tiếp nhận.
- Đợt vá bảo mật trước: [docs/CHANGELOG-BAO-MAT.md](../CHANGELOG-BAO-MAT.md) — đọc trước khi bắt đầu để không kết luận trùng.
