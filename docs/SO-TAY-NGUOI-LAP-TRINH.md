# Sổ tay người lập trình — điều khiển quy trình làm việc với Claude

Dành cho **người**, không dành cho Claude. Claude đọc
[CLAUDE.md](../CLAUDE.md) và [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md).

Bạn đọc file này để biết: gõ gì, khi nào, và **làm sao biết Claude đang đi chệch**.

---

## 0. Phiên tiếp theo nên làm gì

Ba chỗ sau luôn trả lời câu này, theo thứ tự tin cậy giảm dần:

| Hỏi | Xem |
|---|---|
| Phiên gần nhất để lại việc gì | [TIEN-DO.md](TIEN-DO.md), cột **Việc còn dở** của dòng cuối cùng |
| Đợt audit đang ở giai đoạn nào | [kiem-thu-bao-mat/README.md](kiem-thu-bao-mat/README.md) §2 |
| Việc đó cụ thể gồm những gì | [kiem-thu-bao-mat/KE-HOACH.md](kiem-thu-bao-mat/KE-HOACH.md) |

Không muốn tra: gõ `/bat-dau-phien` và để trống phần việc. Lệnh đó đọc cả ba chỗ trên rồi
tự đề xuất, và dừng lại hỏi bạn nếu thấy nhánh bị lệch hoặc có phiên treo.

**Ngay lúc này, việc tiếp theo là:** mở một **cửa sổ Claude hoàn toàn mới** rồi gõ
`/phien-retest BUG-001`. Lý do nó đứng trước cả việc kiểm kê lại nằm ở
[kiem-thu-bao-mat/README.md](kiem-thu-bao-mat/README.md) §2.

> **Vì sao kế hoạch không ghi sẵn "phiên P07 làm việc này".** Đặt trước số phiên đã phải
> đánh số lại hai lần chỉ vì có hai phiên phát sinh ngoài dự kiến. Kế hoạch giờ đặt tên việc
> theo giai đoạn (`GĐ0-a`, `GĐ2-3`…), còn số phiên được cấp lúc phiên thật sự mở và chỉ ghi
> ở `TIEN-DO.md`. Kế hoạch nói **làm gì**, tiến độ nói **ai làm, khi nào**.

---

## 1. Việc muốn làm → lệnh phải gõ

| Bạn muốn | Gõ | Phiên loại |
|---|---|---|
| Hiểu một phần hệ thống trước khi đụng vào | `/bat-dau-phien khảo sát <chủ đề>` | `KHAO-SAT` |
| Đi tìm lỗ hổng theo checklist | `/phien-ra-soat <số nhóm>` | `RA-SOAT` |
| Vá một lỗ hổng đã có mã BUG | `/phien-fix BUG-xxx` | `FIX` |
| **Kiểm chứng** một bản vá | `/phien-retest BUG-xxx` ở **phiên mới** | `RETEST` |
| Thêm hoặc sửa tính năng | `/bat-dau-phien thêm <tính năng>` | `TINH-NANG` |
| Viết, sửa, đồng bộ tài liệu | `/bat-dau-phien tài liệu <việc>` | `TAI-LIEU` |
| Đóng phiên đang mở | `/ket-thuc-phien` | — |

**Quy tắc một câu:** một phiên làm đúng một loại việc. Muốn đổi loại thì đóng phiên, mở phiên mới.

### "Phiên mới" nghĩa là gì

Là một **cửa sổ hội thoại Claude hoàn toàn mới**, không phải một lệnh mới trong cùng cuộc
hội thoại. Claude trong cùng cuộc hội thoại vẫn nhớ nó vừa vá gì và vá thế nào — mà đó
chính là thứ phiên RETEST cần không biết.

---

## 2. Khi nào bắt buộc phải mở phiên RETEST

Đây là câu hỏi hay bị bỏ qua nhất. Ba điều cùng đúng thì **bắt buộc**:

1. Thay đổi nhằm **đóng một lỗ hổng**, không phải thêm tính năng.
2. Người kết luận "xong" **trùng** người viết bản vá.
3. Vá hụt thì hậu quả **không lấy lại được**: lộ danh tính người tố giác, leo quyền.

Và bốn dấu hiệu buộc phải retest kể cả khi ngoài kế hoạch:

- Có commit **từ người khác** chạm vào file đang có BUG mở.
- Bản vá kèm "toàn bộ test pass" mà **không nói test nào đỏ trước khi vá**.
- Bản vá chạm **nhiều file hơn** phạm vi của lỗi.
- Lỗ hổng bị đóng như **tác dụng phụ** của việc khác.

Chi tiết và ví dụ thật: [QUY-TRINH-LAM-VIEC.md §2.1](QUY-TRINH-LAM-VIEC.md).

**Không cần** retest cho: đổi giao diện, đổi chữ hiển thị, tính năng không chạm lớp bảo vệ,
sửa tài liệu.

---

## 3. Bảy dấu hiệu Claude đang đi chệch — ngắt ngay khi thấy

Bạn không cần đọc hết code để kiểm soát. Bảy câu này bắt được phần lớn ca hỏng:

| Dấu hiệu trong lời Claude nói | Vì sao đáng ngờ | Hỏi lại |
|---|---|---|
| "Tôi đã sửa luôn một chỗ khác thấy chưa ổn" | Trôi phạm vi — nguồn lỗi mới số một | "Chỗ đó có trong mục tiêu phiên không? Nếu không thì hoàn nguyên và ghi vào NO-KY-THUAT.md" |
| "Toàn bộ test đã pass" (mà không nói test nào mới) | Test cũ pass không chứng minh gì về lỗ hổng vừa vá | "Test nào **đỏ trước khi vá**? Cho tôi xem output lúc nó đỏ" |
| "Đã fix xong, tôi kiểm tra thấy ổn" trong phiên vừa vá | Tự chấm bài mình | "Không chấm. Để trạng thái `Chờ retest`, tôi mở phiên mới" |
| "Tôi sửa lại test cho khớp" | Sửa kỳ vọng cho vừa code sai | "Vì sao test cũ sai? Nếu code sai thì sửa code" |
| "Chỗ này có thể bỏ qua vì hiếm khi xảy ra" | Chấm mức độ theo cảm tính | "Ghi thành rủi ro chấp nhận có ngày xem xét lại, đừng bỏ qua ngầm" |
| "Để an toàn tôi thêm giá trị mặc định cho biến môi trường" | Mặc định thường yếu → fail-open | "Luật 1: thiếu cấu hình thì từ chối phục vụ" |
| Báo một con số test/endpoint mà không chạy lệnh | Chép từ trí nhớ, đã sai ba lần trong dự án này | "Chạy lệnh đếm rồi nói lại" |

### Một câu hỏi hiệu quả bất ngờ

> "Chỗ nào trong việc vừa làm mà bạn **kém chắc chắn nhất**?"

Nó buộc phải nêu điểm yếu thay vì tổng kết thành công. Câu trả lời thường chỉ thẳng vào chỗ
cần kiểm.

---

## 4. Cổng chặn trước commit — bảy mục bạn tự kiểm

Claude phải chạy đủ bảy mục này ở `/ket-thuc-phien`. Bạn kiểm hai mục quan trọng nhất bằng mắt:

```bash
cd server && npm test          # phai xanh TOAN BO, khong chi test moi
npm run build                  # phai 0 loi TypeScript
git diff --stat                # co file nao ngoai pham vi khong?
```

Thấy file lạ trong `--stat` là tín hiệu rõ nhất của trôi phạm vi. Hỏi ngay.

**Không bao giờ để lọt:**
- `git add .` — luôn `git add` từng file
- Gộp nhiều việc vào một commit
- Chạy formatter toàn dự án chung với commit vá lỗi
- Commit khi test đỏ, kể cả "chỉ đỏ một bài không liên quan"

---

## 5. Làm việc cùng người khác

Đã vấp một lần và tốn ba phiên rà soát. Xem [QUY-TRINH-LAM-VIEC.md §13](QUY-TRINH-LAM-VIEC.md).

**Trước mỗi buổi làm, gõ:**

```bash
git fetch origin
git rev-list --left-right --count HEAD...origin/master
```

Kết quả `0 0` thì làm tiếp. Bất kỳ số nào khác 0 ở cột phải thì **hợp nhất trước, làm sau**.

**Sau mỗi lần merge, kiểm luật gitignore:**

```bash
git check-ignore -v buglogs/BUG-LOG.md
```

Phải in ra một dòng. Không in gì nghĩa là `buglogs/` **đang hở** — dừng lại, đừng chạy
`git add` nào, khôi phục luật trước. Luật này đã bị xoá một lần trong một commit thêm bộ
đếm lượt truy cập, không ai cố ý.

**Ba điều tối thiểu cần thoả thuận với người cùng làm:** một việc một commit · không
`git add .` · không đụng `.gitignore` chung với việc khác.

---

## 6. Ba lớp kiểm một bản vá bảo mật

Không phải lớp nào cũng cần cho mọi lỗi. Biết mình đang bỏ lớp nào là đủ.

| Lớp | Bắt loại lỗi gì | Độc lập | Dùng cho |
|---|---|---|---|
| Trọng tài subagent (trong `/phien-fix`) | Vá hỏng lộ liễu | Nhẹ | Mọi bản vá |
| `/security-review` | Lỗi ngoài checklist của dự án | Không (cùng phiên) | Bản vá đụng nhiều file |
| `/phien-retest` ở phiên mới | Vá không hết biến thể | **Mạnh** | **Bắt buộc** với `Critical`, `High` |
| `/code-review ultra` | Lớp thứ tư, chạy trên cloud | Mạnh | `Critical`, khi muốn chắc thêm. Bạn tự gõ, Claude không gọi được |

---

## 7. Tra nhanh

| Cần biết | Ở đâu |
|---|---|
| **Bản đồ toàn bộ tài liệu** | [README.md](README.md) |
| Đang làm tới đâu | [TIEN-DO.md](TIEN-DO.md) |
| Nợ kỹ thuật đã biết | [NO-KY-THUAT.md](NO-KY-THUAT.md) |
| Lỗ hổng đang mở | `buglogs/BUG-LOG.md` — chỉ có trên máy |
| Kế hoạch audit | [kiem-thu-bao-mat/KE-HOACH.md](kiem-thu-bao-mat/KE-HOACH.md) |
| Quy trình đầy đủ | [QUY-TRINH-LAM-VIEC.md](QUY-TRINH-LAM-VIEC.md) |
| Đợt vá đã xong | [CHANGELOG-BAO-MAT.md](CHANGELOG-BAO-MAT.md) |

Lệnh đếm — **luôn chạy, đừng chép số từ tài liệu**:

```bash
ls server/tests/*.test.js | wc -l
grep -rnoE "router\.(get|post|put|patch|delete)\(" server/src/routes | wc -l
```
