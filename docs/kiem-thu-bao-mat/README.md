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

## 2. Timeline tổng quan (12 ngày làm việc)

| Ngày làm việc | Ngày dương lịch | Giai đoạn | Đầu ra bắt buộc |
|---|---|---|---|
| D1 | Thứ 5, 10/09/2026 | GĐ1 — Kiểm kê | Bản đồ hệ thống, danh sách endpoint |
| D2 | Thứ 6, 11/09/2026 | GĐ1 — Kiểm kê | Sơ đồ luồng dữ liệu nhạy cảm, danh sách giới hạn nghiệp vụ |
| — | 12–13/09 | *Nghỉ cuối tuần* | — |
| D3 | Thứ 2, 14/09/2026 | GĐ2 — Rà soát | Nhóm 1–2: Auth/Session, Authorization (IDOR) |
| D4 | Thứ 3, 15/09/2026 | GĐ2 — Rà soát | Nhóm 3–4: Injection/XSS/SSRF/Upload, Bảo vệ dữ liệu |
| D5 | Thứ 4, 16/09/2026 | GĐ2 — Rà soát | Nhóm 5–6: API security, Business logic & giới hạn |
| D6 | Thứ 5, 17/09/2026 | GĐ2 — Rà soát | Nhóm 7–8: Hạ tầng/secrets, Scalability + chốt Bug Log |
| D7 | Thứ 6, 18/09/2026 | GĐ3 — Fix | Xử lý toàn bộ **Critical** |
| — | 19–20/09 | *Nghỉ cuối tuần* | — |
| D8 | Thứ 2, 21/09/2026 | GĐ3 — Fix | Xử lý **High** |
| D9 | Thứ 3, 22/09/2026 | GĐ3 — Fix | Xử lý **Medium/Low** + hoàn tất Security Decision Log |
| D10 | Thứ 4, 23/09/2026 | GĐ4 — Retest | Retest Critical/High (độc lập) |
| D11 | Thứ 5, 24/09/2026 | GĐ4 — Retest | Retest Medium/Low + regression toàn hệ thống |
| D12 | Thứ 6, 25/09/2026 | GĐ5 — Báo cáo | Báo cáo tổng kết + bộ slide thuyết trình |

**Điều kiện thoát (exit criteria) — không được bỏ qua:**
- Không còn lỗi `Critical` hoặc `High` ở trạng thái mở.
- Mọi lỗi đã đóng đều có kết quả retest do **người/AI khác với người fix** ghi nhận.
- Mọi fix Critical/High đều có một Security Decision Log tương ứng.
- `cd server && npm test` xanh toàn bộ; `npm run build` (frontend) không lỗi TypeScript.

Nếu D11 phát sinh lỗi mới do fix gây ra → quay lại GĐ3, đẩy lùi GĐ5 sang D13 (28/09).
Việc trượt lịch phải ghi vào báo cáo, không được giấu.

## 3. Mục lục tài liệu

| File | Nội dung |
|---|---|
| [01-GIAI-DOAN-1-KIEM-KE.md](01-GIAI-DOAN-1-KIEM-KE.md) | Kiểm kê endpoint, luồng dữ liệu, giới hạn nghiệp vụ |
| [02-GIAI-DOAN-2-RA-SOAT.md](02-GIAI-DOAN-2-RA-SOAT.md) | Checklist rà soát 8 nhóm hạng mục |
| [03-GIAI-DOAN-3-FIX.md](03-GIAI-DOAN-3-FIX.md) | Quy trình fix theo ưu tiên, kỷ luật commit |
| [04-GIAI-DOAN-4-RETEST.md](04-GIAI-DOAN-4-RETEST.md) | Retest độc lập — nguyên tắc và checklist |
| [05-GIAI-DOAN-5-BAO-CAO.md](05-GIAI-DOAN-5-BAO-CAO.md) | Tổng hợp báo cáo, cấu trúc slide |
| [PHU-LUC-A-MAU-BUG-LOG.md](PHU-LUC-A-MAU-BUG-LOG.md) | Mẫu Bug Log + thang đánh giá mức độ |
| [PHU-LUC-B-MAU-SECURITY-DECISION-LOG.md](PHU-LUC-B-MAU-SECURITY-DECISION-LOG.md) | Mẫu Security Decision Log |
| [PHU-LUC-C-BO-TEST-PHONG-THU.md](PHU-LUC-C-BO-TEST-PHONG-THU.md) | Bộ test xác nhận giới hạn không bị lách |
| [PHU-LUC-D-CONG-CU.md](PHU-LUC-D-CONG-CU.md) | SAST/DAST/dependency scan — lệnh chạy cụ thể |
| [06-KE-HOACH-THEO-PHIEN.md](06-KE-HOACH-THEO-PHIEN.md) | Bẻ 12 ngày thành phiên Claude P01–P10 + phiên FIX/RETEST |

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
