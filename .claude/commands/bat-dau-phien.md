---
description: Mở phiên làm việc — kiểm tiến độ, xác định mục tiêu, cảnh báo nợ kỹ thuật, đề xuất kế hoạch
---

Mở một phiên làm việc mới cho dự án Hộp Thư An Ninh Số.

Người dùng có thể đã nêu việc muốn làm: **$ARGUMENTS**
Nếu để trống, hãy tự đề xuất dựa trên tiến độ.

Chạy đủ 8 bước dưới đây, **theo đúng thứ tự**. Không bỏ bước nào, kể cả khi thấy hiển nhiên.

---

## Bước 1 — Đọc tình hình

Đọc song song:
- `docs/TIEN-DO.md` — phiên gần nhất làm gì, còn dở gì
- `docs/NO-KY-THUAT.md` — nợ đã biết
- `git log --oneline -10` và `git status --short`

## Bước 2 — Phát hiện phiên bỏ dở  ⚠️ làm trước mọi thứ khác

Tìm trong `docs/TIEN-DO.md` phiên nào còn trạng thái `ĐANG CHẠY`.

Nếu có, **dừng lại và xử lý trước**. Đối chiếu `git status` với mục tiêu phiên đó:

| Tình huống | Xử lý |
|---|---|
| Có thay đổi chưa commit, khớp mục tiêu phiên cũ | Hỏi người dùng: tiếp tục phiên cũ, hay đóng nó lại rồi mở phiên mới? |
| Có thay đổi chưa commit, **không** khớp mục tiêu nào | Báo rõ: đây là thay đổi mồ côi. Hỏi giữ hay bỏ. |
| Không có thay đổi nào | Phiên cũ hỏng giữa chừng, không kịp ghi. Đánh dấu `BỎ DỞ` kèm ghi chú, rồi đi tiếp. |

Không được âm thầm mở phiên mới đè lên phiên cũ đang treo.

## Bước 3 — Kiểm môi trường chạy được

```bash
ls -d node_modules server/node_modules 2>&1
```

Thiếu `node_modules` → **cổng Definition of Done sẽ không chạy được** ở cuối phiên
(không test được, không build được). Báo ngay cho người dùng ở đầu phiên, hỏi có cài không.
Đừng để tới lúc kết thúc phiên mới phát hiện.

## Bước 4 — Xác định loại phiên

Chọn đúng **một** loại. Nói rõ vì sao chọn loại đó.

| Loại | Khi nào | Cấm |
|---|---|---|
| `KHAO-SAT` | Cần hiểu trước khi làm; kiểm kê; vẽ luồng | Sửa code |
| `RA-SOAT` | Đi tìm lỗ hổng theo checklist | Sửa code — thấy lỗi thì **ghi vào Bug Log** |
| `FIX` | Vá một BUG cụ thể đã có trong Bug Log | Retest chính bug đó |
| `RETEST` | Kiểm độc lập một bản vá | Dùng `/phien-retest` thay vì lệnh này |
| `TINH-NANG` | Thêm/sửa tính năng | Đụng bản vá bảo mật đang mở |
| `TAI-LIEU` | Viết, sửa, đồng bộ tài liệu | Sửa code |

**Nếu người dùng yêu cầu việc thuộc hai loại khác nhau** → nói rõ và đề nghị tách thành hai phiên.
Đặc biệt: yêu cầu "fix rồi kiểm luôn" phải bị từ chối, giải thích theo luật 8 trong `CLAUDE.md`.

## Bước 5 — Kiểm Definition of Ready

Bốn điều kiện. Thiếu bất kỳ điều nào → hỏi người dùng cho rõ **trước khi** làm.

- [ ] **Mục tiêu viết được thành một câu**, có động từ và có đối tượng cụ thể
- [ ] **Tiêu chí xong đo được** — lệnh nào chạy, kết quả nào chứng minh là xong
- [ ] **Biết trước sẽ đụng file nào** (danh sách ước lượng, không cần chính xác tuyệt đối)
- [ ] **Không phụ thuộc việc chưa xong** ở phiên khác

## Bước 6 — Cảnh báo trước khi làm

Rà và nêu rõ, ngắn gọn:

- **Nợ kỹ thuật liên quan** — món nào trong `NO-KY-THUAT.md` chạm vào vùng sắp sửa
- **Luật bất di bất dịch nào áp dụng** — trong 10 luật ở `CLAUDE.md`, cái nào dễ vi phạm ở việc này
- **Ba biến thể backend** — nếu đụng `server/src/`, nhắc kiểm cả `index.js`, `may-chu-cong-khai.js`, `may-chu-can-bo.js`
- **Đã vá rồi chưa** — nếu là việc bảo mật, đối chiếu `docs/CHANGELOG-BAO-MAT.md` để không báo trùng
- **Tài liệu sẽ phải cập nhật** — theo bảng ánh xạ trong `docs/QUY-TRINH-LAM-VIEC.md` §D

## Bước 7 — Đề xuất kế hoạch phiên

Trình bày cho người dùng duyệt:

```
PHIÊN: <mã>        LOẠI: <loại>
MỤC TIÊU: <một câu>
XONG KHI: <tiêu chí đo được>
FILE SẼ ĐỤNG: <danh sách>
CẢNH BÁO: <nợ kỹ thuật / luật áp dụng / rủi ro>
CÁC BƯỚC:
  1. ...
  2. ...
NGOÀI PHẠM VI PHIÊN NÀY: <những gì cố tình không làm>
```

**Ước lượng độ lớn.** Phiên ôm quá rộng sẽ cạn ngữ cảnh giữa chừng và bỏ dở không dấu vết.
Nếu thấy quá lớn → đề nghị cắt, nêu rõ phần nào để lại phiên sau. WIP = 1: một phiên một mục tiêu.

Mục **NGOÀI PHẠM VI** không phải hình thức — nó là hàng rào chống trôi phạm vi trong lúc làm.

## Bước 8 — Ghi `ĐANG CHẠY` vào tiến độ  ⚠️ trước khi bắt tay vào việc

Lấy SHA mốc để có đường lùi:

```bash
git rev-parse --short HEAD
```

Thêm dòng vào bảng trong `docs/TIEN-DO.md` với trạng thái `ĐANG CHẠY`.

Ghi **ngay bây giờ**, không đợi cuối phiên. Phiên đứt giữa chừng là chuyện thường; nếu chỉ
ghi lúc kết thúc thì đúng những phiên hỏng lại là những phiên không để lại dấu vết nào.

⚠️ `docs/TIEN-DO.md` là file **công khai trên GitHub**. Chỉ ghi mã `BUG-xxx`, tuyệt đối
không mô tả chi tiết lỗ hổng đang mở.

Xong bước 8 thì báo người dùng đã sẵn sàng và bắt đầu làm.
