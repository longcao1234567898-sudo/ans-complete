---
description: Mở phiên RA-SOAT cho một nhóm hạng mục — đi tìm lỗ hổng theo checklist, ghi Bug Log, tuyệt đối không vá
---

Mở phiên **RA-SOAT** cho: **$ARGUMENTS**

(Tham số là số nhóm, ví dụ `nhóm 2` hoặc `2`. Để trống thì đọc
`docs/kiem-thu-bao-mat/KE-HOACH.md`, tìm nhóm chưa rà, và đề xuất.)

---

## ⚠️ Luật của phiên này — đọc trước khi làm bất cứ gì

**Phiên này KHÔNG SỬA CODE.** Một dòng cũng không.

Thấy lỗ hổng thì **ghi Bug Log**, rồi đi tiếp sang mục kiểm kế tiếp. Lý do không phải là
hình thức: vá ngay giữa lúc đang rà làm mất tính hệ thống của đợt rà soát. Một phiên vừa
vá xong sẽ đọc phần còn lại bằng con mắt của người đang bận, và những mục kiểm cuối danh
sách sẽ được rà qua loa. Rà hết rồi mới vá, và vá ở phiên khác.

Ngoại lệ duy nhất: được **viết test** tái hiện lỗ hổng để chứng minh nó có thật. Test đó
để **đỏ**, không sửa code cho nó xanh — phiên `FIX` sẽ làm việc đó.

---

## Bước 1 — Xác nhận nền còn đúng

```bash
git fetch origin
git rev-list --left-right --count HEAD...origin/master
git log --oneline -5
```

Rà soát trên một bản mã đã lỗi thời là rà soát vứt đi. Lệch nhánh → **dừng**, hợp nhất
trước. Đây đúng là thứ đã làm hỏng kết quả kiểm kê của P01–P03.

Ghi lại SHA đang rà vào Bug Log của mọi lỗi mở trong phiên. Không có SHA thì phiên RETEST
sau này không biết lỗi được phát hiện trên bản nào.

## Bước 2 — Nạp checklist của nhóm

```bash
grep -n "Nhóm <N> —" docs/kiem-thu-bao-mat/phuong-phap/2-ra-soat.md
```

Đọc **toàn bộ** mục kiểm của nhóm trước khi rà mục đầu tiên. Biết trước cả danh sách thì
mới nhận ra khi hai mục kiểm đang chỉ vào cùng một gốc rễ.

Đọc thêm, bắt buộc:
- `docs/CHANGELOG-BAO-MAT.md` — để không báo trùng thứ đã vá đợt trước
- `buglogs/BUG-LOG.md` — để không mở hai mã cho cùng một lỗi
- `docs/NO-KY-THUAT.md` — vài món nợ đã ghi sẵn thuộc đúng nhóm đang rà

## Bước 3 — Rà từng mục, ghi kết quả cho **mọi** mục

Mỗi mục kiểm phải có một trong ba kết quả. Không được để trống:

| Kết quả | Nghĩa |
|---|---|
| **Đạt** | Đã kiểm, có lớp bảo vệ, nêu rõ ở file:dòng nào |
| **Lỗ hổng** | Mở `buglogs/bugs/BUG-xxx.md` theo mẫu `_MAU-BUG.md` |
| **Không kết luận được** | Nêu rõ **vì sao** và **cần gì để kết luận** |

Ô thứ ba là ô trung thực nhất và hay bị bỏ qua nhất. "Chưa kiểm được cờ cookie vì không có
staging HTTPS" là một kết quả hợp lệ. "Đạt" khi thực ra chỉ đọc mã thì không.

**Phân biệt ba mức bằng chứng** — ghi rõ mức nào vào Bug Log:

| Mức | Cách | Đủ để kết luận? |
|---|---|---|
| Đọc mã | Suy luận từ mã nguồn | Đủ để **mở** BUG, chưa đủ để chấm mức độ |
| Test tự động | Viết test tái hiện, chạy thấy đỏ | Đủ cho phần lớn trường hợp |
| Chạy thật | Script gọi API thật, lưu vào `buglogs/` | Bắt buộc với `Critical` |

## Bước 4 — Kiểm cả ba biến thể khởi động

Đụng `server/src/` thì phải đối chiếu `index.js`, `may-chu-cong-khai.js`, `may-chu-can-bo.js`
(nợ ND-010). Lớp bảo vệ có ở một file mà thiếu ở hai file kia là lỗ hổng thật, không phải
chuyện dọn dẹp.

## Bước 5 — Chấm mức độ theo thang hai trục

Theo `docs/kiem-thu-bao-mat/bieu-mau/bug-log.md`: **tác động** × **độ dễ khai thác**.

Một câu hỏi phải trả lời cho mọi lỗi, vì nó quyết định thứ tự vá:
**lỗi này có dẫn tới lộ danh tính người tố giác không?** Có thì nâng một bậc.

Không chắc giữa hai mức → chọn mức cao hơn và ghi rõ lý do phân vân. Phiên chốt Bug Log
sẽ hạ xuống nếu cần; để sót một lỗi nặng thì không có phiên nào cứu.

## Bước 6 — Ghi Bug Log và đóng phiên

Mỗi lỗ hổng: một file `buglogs/bugs/BUG-xxx.md`, điền **Phần 1**, để trống Phần 2 và 3.
Bắt buộc có: kịch bản khai thác chạy lại được, và **danh sách biến thể cần thử khi retest**.

Danh sách biến thể là thứ có giá trị nhất phiên này để lại. Phiên RETEST sẽ lấy đề bài từ
đó chứ không lấy từ mô tả của người vá. Viết nó cho một người lạ và hoài nghi.

Cập nhật bảng tổng hợp và bảng thống kê trong `buglogs/BUG-LOG.md`.

⚠️ Tài liệu công khai (`docs/TIEN-DO.md`, `docs/NO-KY-THUAT.md`) chỉ ghi **mã** `BUG-xxx`.
Không mô tả lỗ hổng đang mở. Đóng phiên bằng `/ket-thuc-phien`.
