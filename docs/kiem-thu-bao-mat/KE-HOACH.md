# Kế hoạch audit bẻ theo phiên Claude

Bản [README.md](README.md) chia đợt audit theo **ngày làm việc**. File này bẻ tiếp thành
**phiên Claude** — đơn vị thực thi thật sự. Quy trình phiên: [../QUY-TRINH-LAM-VIEC.md](../QUY-TRINH-LAM-VIEC.md).

Ghi tiến độ ở [../TIEN-DO.md](../TIEN-DO.md).

> **Bản này viết lại ngày 2026-09-23.** Kế hoạch cũ đã hỏng vì lý do nêu ngay dưới đây.
> Đọc hết mục "Vì sao phải làm lại" trước khi mở phiên đầu tiên.

---

## Vì sao phải làm lại Giai đoạn 1 và 2

Ngày 2026-09-23 phát hiện nhánh trên GitHub đã rẽ khỏi máy từ commit `d8d11a9` — đúng lúc
đóng phiên P00. Ba phiên P01, P02, P03 sau đó đều rà soát trên bản mã ở máy, trong khi bản
đang chạy đã đi tiếp 19 commit.

Bốn hệ quả:

| Hệ quả | Chi tiết |
|---|---|
| **Kiểm kê endpoint sai** | P01 kiểm kê trên bản có 66 endpoint. Bản đã hợp nhất có 78 |
| **Bề mặt tấn công mới chưa từng rà** | Tải tài liệu đính kèm, quản trị tin tức, quản trị điểm đen giao thông, endpoint thống kê, `submissions.js` viết lại |
| **BUG-003 bị vá từ ngoài kế hoạch** | Không có test đỏ trước, không có SEC-DEC. Theo chính danh sách biến thể trong Bug Log thì mới đóng được một trong ba |
| **BUG-001 mức Critical không rõ trạng thái** | Bản vá cho BUG-003 có thể đã chặn luôn nó như tác dụng phụ. Chưa ai xác nhận |

**Cái gì giữ lại, cái gì bỏ:**

| Giữ | Bỏ, làm lại |
|---|---|
| 4 BUG đã mở — lỗ hổng là thật, chỉ trạng thái cần kiểm lại | Ba bảng kiểm kê endpoint A/B/C của §1.1 |
| Phương pháp, checklist 8 nhóm, thang chấm mức độ | 5 sơ đồ luồng dữ liệu nhạy cảm |
| Ba đính chính tài liệu mà P02 đã ghi | Bảng "Thực thi ở đâu" cho các giới hạn nghiệp vụ |
| Danh sách biến thể cần thử của từng BUG | Kết luận 12 mục kiểm nhóm 1 của P03 |

Kết luận nhóm 1 phải làm lại vì `middleware/auth.js` — file trung tâm của nhóm đó — đã đổi.

---

## Nguyên tắc chia phiên

1. **Một phiên một loại, một mục tiêu đóng được** (WIP = 1).
2. **Mọi phiên mở bằng bước kiểm lệch nhánh.** Đây là bài học đắt nhất của đợt này. `/bat-dau-phien` bước 2.
3. **Phiên `RA-SOAT` không sửa code.** Mở bằng `/phien-ra-soat <nhóm>`.
4. **`FIX` và `RETEST` của cùng một BUG bắt buộc tách phiên**, và phiên RETEST phải là phiên Claude hoàn toàn mới.
5. Phiên tràn thì đóng ở `XONG MỘT PHẦN`, không cố kéo.

---

## Giai đoạn 0 — Gỡ hai ẩn số đang treo  ⚠️ làm trước tất cả

Hai phiên này đứng trước cả việc kiểm kê lại, vì chúng rẻ và vì một trong hai đang che một
lỗi `Critical` không rõ trạng thái. Không ai nên đi kiểm kê endpoint trong khi chưa biết
người ngoài có đọc được danh tính người tố giác hay không.

| Phiên | Loại | Mục tiêu | Xong khi | Lệnh |
|---|---|---|---|---|
| **GĐ0-a** | `RETEST` | Kiểm chứng BUG-001 — nó còn khai thác được không sau khi mã đã đổi | Chạy script kiểm chứng sẵn có trên mã đã hợp nhất, có output; bốn biến thể trong Bug Log đều có kết luận kèm bằng chứng | `/phien-retest BUG-001` |
| **GĐ0-b** | `RETEST` | Kiểm chứng bản vá BUG-003 đến từ ngoài kế hoạch | Ba biến thể (a)(b)(c) đều có kết luận kèm bằng chứng; Phần 3 Bug Log điền xong | `/phien-retest BUG-003` |

> ⚠️ **Cả hai phải là phiên Claude hoàn toàn mới.** Phiên đã dựng kế hoạch này biết quá
> nhiều về hai bản vá đó để làm trọng tài.

**Ghi chú cho GĐ0-a:** bản vá cho BUG-003 thêm một truy vấn `staff` theo `sub` của token. Vé
OTP mang `sub` không phải id cán bộ nên **có thể** bị chặn ở đó. Đừng kết luận bằng suy luận,
chạy script. Và thử biến thể: `sub` trùng một id cán bộ có thật thì sao?

**Ghi chú cho GĐ0-b:** danh sách biến thể đã có sẵn trong Bug Log. Đọc từ đó, không đọc mô tả
trong commit. Đặc biệt biến thể (b) hạ vai trò giữa chừng và (c) đăng xuất rồi dùng lại.

Kết quả hai phiên này quyết định thứ tự phần còn lại. `Chưa fix triệt để` → chèn phiên `FIX`
ngay sau, trước khi đi tiếp.

---

## Giai đoạn 1 — Kiểm kê lại trên mã đã hợp nhất

| Phiên | Loại | Mục tiêu | Xong khi |
|---|---|---|---|
| **GĐ1-a** | `KHAO-SAT` | Kiểm kê lại toàn bộ endpoint, dựng lại ba bảng A/B/C của §1.1 | Số endpoint là **số đếm được**, không chép; mọi route dưới `/api/admin` ghi rõ `authorize()` gì; ba biến thể khởi động đã đối chiếu |
| **GĐ1-b** | `KHAO-SAT` | Vẽ lại 5 luồng dữ liệu nhạy cảm, **thêm luồng thứ 6: tải tài liệu đính kèm**; dựng lại bảng giới hạn nghiệp vụ §2.2 | 6 sơ đồ xong; bảng §2.2 đầy đủ cột "Thực thi ở đâu"; có danh sách điểm nghi ngờ chuyển sang GĐ2 |

**Vùng hoàn toàn mới, chưa từng có trong bản kiểm kê cũ** — Hai phiên GĐ1 phải phủ hết:

| Vùng | File | Vì sao đáng chú ý |
|---|---|---|
| Tải tài liệu đính kèm | `server/src/lib/tai-lieu-an-toan.js` | Bề mặt tấn công mới hoàn toàn. Loại file, kích thước, nơi lưu, đường đọc lại |
| Quản trị tin tức | `server/src/routes/admin/news.js` | Cán bộ tự đăng nội dung hiển thị công khai |
| Quản trị điểm đen giao thông | `server/src/routes/admin/diem-den.js`, `routes/diem-den.js` | Có cả route công khai lẫn route quản trị |
| Thống kê | `server/src/routes/thong-ke.js` | Endpoint công khai đọc số liệu tổng hợp — kiểm xem có rò rỉ gì qua số đếm không |
| Gửi ý kiến | `server/src/routes/submissions.js` | Bị viết lại, không phải thêm mới |
| Schema | `database/nang_cap_v18.sql` và 4 script địa bàn | Hai file schema cũ bị **sửa tại chỗ**, không phải thêm migration mới |

---

## Giai đoạn 2 — Rà soát 8 nhóm

Tám nhóm hạng mục, tám phiên, mở bằng `/phien-ra-soat <nhóm>`.

| Phiên | Nhóm | Mục tiêu | Lưu ý riêng |
|---|---|---|---|
| **GĐ2-1** | 1 | Xác thực & phiên đăng nhập (12 mục) | Làm lại hoàn toàn: `middleware/auth.js` đã đổi. Đọc kết quả GĐ0 trước |
| **GĐ2-2** | 2 | **Phân quyền / IDOR** (12 mục) — ưu tiên cao nhất | Ma trận `route × vai trò` phải phủ cả route admin mới. Chuỗi `/assign` rồi `/reveal` phải thử thật |
| **GĐ2-3** | 3 | Input validation & injection (13 mục) | ⚠️ Kiểm kỹ ngoại lệ `coNB` vừa thêm vào luật G8 của `khong-duoc-pha.test.js` — đó là một allow-list chống nối chuỗi SQL bị nới ra cho `admin/news.js`. Kèm luồng tải tài liệu |
| **GĐ2-4** | 4 | Bảo vệ dữ liệu (10 mục) | ⚠️ Có một điểm nghi về dữ liệu mẫu trong `database/`, chi tiết ghi ở `buglogs/ghi-chu-P04-diem-nghi.md`. Cần **hỏi thẳng người vận hành**, đừng suy đoán |
| **GĐ2-5** | 5 | Bảo mật API (12 mục) | Ba biến thể khởi động (ND-010, ND-012) |
| **GĐ2-6** | 6 | Business logic & giới hạn (12 mục) + **viết bộ test phòng thủ** | Test ở [bộ test phòng thủ](phuong-phap/bo-test-phong-thu.md). Bộ này là **trọng tài** cho mọi phiên RETEST sau |
| **GĐ2-7** | 7 | Hạ tầng & secrets (12 mục) + **chạy công cụ tự động** | Semgrep, `npm audit` (nợ ND-003), soát git history. ⚠️ Soát cả lịch sử xem `.gitignore` còn bị đụng lần nào nữa không |
| **GĐ2-8** | 8 | Scalability (8 mục) + **chốt và phân loại Bug Log** | Chốt thứ tự vá. Lập SEC-DEC cho quyết định MFA (nợ ND-015) |

### Ba câu hỏi nghiệp vụ phải hỏi người vận hành, không tự trả lời

Ba phiên liên tiếp đã vướng vì không hỏi. Hỏi sớm, đừng để tới phiên rà soát nhóm 7:

1. **Biến môi trường thật trên Render là gì?** Cụ thể `TURNSTILE_SECRET_KEY` có được đặt không — nó quyết định mức độ thật của BUG-002. Ô này trống từ P01.
2. **Khi phát hiện cán bộ tha hoá, chỉ huy có chấp nhận chờ tới 8 giờ không?** Quyết định mức độ đúng của BUG-003 và có nên rút thời hạn phiên truy cập không.
3. **Dữ liệu mẫu trong `database/` là bịa hay thật?** Chi tiết câu hỏi ở `buglogs/ghi-chu-P04-diem-nghi.md`. Nếu là dữ liệu thật thì đây là sự cố, không phải một mục kiểm.

---

## Giai đoạn 3 — Fix theo ưu tiên

Số phiên tuỳ số lỗi tìm được. Mở bằng `/phien-fix BUG-xxx`.

| Mức độ | Lỗi/phiên | Vì sao |
|---|---|---|
| `Critical` | **1** | Một lỗi một phiên, một commit. Không gộp |
| `High` | 1–2 | Tuỳ độ phức tạp |
| `Medium` / `Low` | 2–4 | Được gộp trong một phiên nhưng **vẫn mỗi lỗi một commit** |

Bắt buộc trong mọi phiên `FIX`: test đỏ **trước** và nhìn thấy nó đỏ · vá gốc rễ không vá
triệu chứng · trọng tài subagent · SEC-DEC với `Critical`/`High` · commit riêng · **để trống
Phần 3 Bug Log**.

## Giai đoạn 4 — Retest độc lập

Mỗi BUG một phiên `/phien-retest`, mở bằng phiên Claude hoàn toàn mới. Thứ tự: `Critical`
trước, `High` sau, `Medium`/`Low` cuối, kèm một phiên hồi quy toàn hệ thống.

Lỗi mới phát sinh → mở BUG mới, ghi `Sinh ra bởi: fix của BUG-xxx`, quay lại GĐ3.

## Giai đoạn 5 — Báo cáo

Một phiên `TAI-LIEU`: báo cáo 7 phần theo [phuong-phap/5-bao-cao.md](phuong-phap/5-bao-cao.md).

Mục "Bài học" của báo cáo lần này có sẵn hai số liệu thật, đừng bỏ phí:
- Bảng "Lỗi phát sinh do chính quá trình fix" trong `buglogs/BUG-LOG.md`
- Sự cố lệch nhánh 2026-09-23: ba phiên rà soát trên mã lỗi thời, và luật gitignore bảo vệ nhật ký lỗ hổng bị xoá mà không ai cố ý

---

## Bảng theo dõi

> **Cột "Phiên nào làm" để trống cho tới khi phiên đó thật sự mở.** Kế hoạch này mô tả
> *việc gì*, `TIEN-DO.md` ghi *ai làm, khi nào*. Trước đây kế hoạch đặt trước số phiên
> (P04 là nhóm 2, P05 là nhóm 3…) và phải đánh số lại hai lần chỉ vì có hai phiên phát sinh
> ngoài dự kiến. Số phiên giờ được cấp lúc mở phiên, không cấp trước.

| Việc | Loại | Trạng thái | Phiên nào làm |
|---|---|---|---|
| **GĐ0-a** — kiểm chứng BUG-001 | RETEST | ⏳ | |
| **GĐ0-b** — kiểm chứng BUG-003 | RETEST | ⏳ | |
| **GĐ1-a** — kiểm kê lại endpoint | KHAO-SAT | ⏳ | |
| **GĐ1-b** — luồng dữ liệu + luồng tải tài liệu | KHAO-SAT | ⏳ | |
| **GĐ2-1** — nhóm 1, xác thực & phiên đăng nhập | RA-SOAT | ⏳ | |
| **GĐ2-2** — nhóm 2, phân quyền / IDOR | RA-SOAT | ⏳ | |
| **GĐ2-3** — nhóm 3, input validation & injection | RA-SOAT | ⏳ | |
| **GĐ2-4** — nhóm 4, bảo vệ dữ liệu | RA-SOAT | ⏳ | |
| **GĐ2-5** — nhóm 5, bảo mật API | RA-SOAT | ⏳ | |
| **GĐ2-6** — nhóm 6, business logic + bộ test phòng thủ | RA-SOAT | ⏳ | |
| **GĐ2-7** — nhóm 7, hạ tầng & secrets + công cụ tự động | RA-SOAT | ⏳ | |
| **GĐ2-8** — nhóm 8, scalability + chốt Bug Log | RA-SOAT | ⏳ | |
| **GĐ3** — fix theo ưu tiên | FIX | ⏳ | mỗi lỗi một phiên |
| **GĐ4** — retest độc lập | RETEST | ⏳ | mỗi lỗi một cửa sổ Claude mới |
| **GĐ5** — báo cáo tổng kết | TAI-LIEU | ⏳ | |

**Đã làm trước đợt này, phải làm lại:** ba phiên P01, P02, P03 đã chạy GĐ1 và nhóm 1 của
GĐ2 trên một bản mã lỗi thời. Giữ lại 4 BUG đã mở và danh sách biến thể của chúng; bỏ ba
bảng kiểm kê, 5 sơ đồ luồng dữ liệu, và kết luận 12 mục kiểm nhóm 1.

Trạng thái thật cập nhật ở [../TIEN-DO.md](../TIEN-DO.md); bảng này chỉ là khung việc.
