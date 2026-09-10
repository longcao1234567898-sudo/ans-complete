---
description: Đóng phiên — đối chiếu mục tiêu, chạy cổng DoD, commit từng việc, cập nhật tiến độ và tài liệu
---

Đóng phiên làm việc hiện tại.

Ghi chú thêm từ người dùng (nếu có): **$ARGUMENTS**

Chạy đủ 8 bước, **theo thứ tự**. Cổng Definition of Done ở bước 2 là bắt buộc — không được
commit khi chưa qua đủ.

---

## Bước 1 — Đối chiếu việc đã làm với mục tiêu phiên

Đọc dòng `ĐANG CHẠY` trong `docs/TIEN-DO.md` để lấy lại mục tiêu và SHA mốc, rồi:

```bash
git status --short
git diff --stat
git log --oneline <SHA-mốc>..HEAD
```

Trả lời thẳng ba câu, **không tô hồng**:

1. Mục tiêu phiên đã đạt chưa? Đạt bao nhiêu phần?
2. Có làm gì **ngoài** mục tiêu không? (nếu có → đây là trôi phạm vi, phải nói rõ)
3. Còn dở gì?

Nếu chưa đạt mục tiêu, cứ nói chưa đạt. Báo cáo sai làm hỏng cả chuỗi phiên sau.

## Bước 2 — Cổng Definition of Done  ⚠️ bắt buộc

Bảy mục. **Thiếu bất kỳ mục nào → không commit.**

| # | Kiểm | Cách kiểm |
|---|---|---|
| 1 | Test backend xanh toàn bộ | `cd server && npm test` — không chỉ test mới, **toàn bộ** |
| 2 | Frontend build sạch | `npm run build` (chỉ cần khi có đụng `src/`) |
| 3 | Diff đã đọc từng file | Đọc thật, đối chiếu bảng dấu hiệu đáng ngờ ở dưới |
| 4 | Không secret lọt vào | Soát diff tìm chuỗi dài, khoá, mật khẩu, token |
| 5 | Không file ngoài phạm vi | File lạ trong `--stat` → tách commit khác hoặc hoàn nguyên |
| 6 | Tài liệu đã đồng bộ | Theo bảng ánh xạ ở bước 5 |
| 7 | Số liệu trong tài liệu là số đo được | Chạy lệnh đếm, không chép lại từ trí nhớ |

**Bảng dấu hiệu đáng ngờ khi đọc diff** (mục 3):

| Dấu hiệu | Vì sao đáng ngờ |
|---|---|
| File bị chạm nằm ngoài phạm vi mục tiêu | "Tiện tay sửa thêm" — nguồn lỗi mới phổ biến nhất |
| Kiểm tra bị **nới lỏng** ở chỗ khác | Vá chỗ A bằng cách nới chỗ B cho hết đỏ test |
| `catch {}` mới nuốt lỗi im lặng | Biến lỗi thành fail-open |
| Điều kiện đổi `&&` thành `\|\|` | Cách kinh điển làm hỏng kiểm quyền |
| Test bị **sửa** thay vì thêm | Sửa kỳ vọng cho khớp code sai |
| `authorize()` bị bỏ hoặc thêm vai trò | Nới quyền để "cho chạy được" |
| Biến môi trường mới có giá trị mặc định | Mặc định thường yếu → fail-open |

Nếu `node_modules` chưa cài thì mục 1–2 **không chạy được**. Không được coi là đã qua cổng.
Báo rõ cho người dùng, ghi vào `TIEN-DO.md` là chưa kiểm chứng được, và **hỏi** trước khi commit.

## Bước 3 — Commit từng việc một

**Một bug / một việc = một commit.** Không gộp. Không `git add .` cả đống.

```bash
git add <đúng những file thuộc việc này>
git status --short          # xác nhận staged đúng phần muốn
```

Mẫu commit theo lối sẵn có của dự án — **tiếng Việt không dấu** ở tiêu đề:

```
<Mo ta ngan viec da lam> [BUG-xxx neu co]

VAN DE: <mot cau — vi sao phai sua>
CACH SUA: <mot den hai cau>
ANH HUONG: <file/luong nao bi cham toi>
KIEM THU: <n/n dat> · TypeScript: <n loi>
```

Chỉ ghi con số kiểm thử **thật sự vừa chạy được**. Không có số thì ghi `chua chay duoc (thieu node_modules)`.

**Không** chạy formatter/linter toàn dự án chung với commit vá lỗi — nó chôn thay đổi thật
giữa hàng nghìn dòng đổi định dạng.

Hỏi người dùng trước khi `git push`. Đã chốt là push thẳng, không squash — nên commit sai là sai công khai.

## Bước 4 — Cập nhật `docs/TIEN-DO.md`

Đổi trạng thái dòng phiên từ `ĐANG CHẠY` sang một trong:

| Trạng thái | Nghĩa |
|---|---|
| `XONG` | Đạt mục tiêu, qua đủ cổng DoD, đã commit |
| `XONG MỘT PHẦN` | Đạt một phần, phần còn lại ghi rõ ở cột việc còn dở |
| `KHÔNG COMMIT` | Có làm nhưng chưa qua cổng DoD — ghi rõ vướng mục nào |
| `BỎ DỞ` | Đứt giữa chừng |

Điền: commit SHA · việc còn dở · ghi chú cho phiên sau.

⚠️ File này **công khai trên GitHub**. Chỉ ghi mã `BUG-xxx`, không mô tả lỗ hổng đang mở.

## Bước 5 — Cập nhật tài liệu theo bảng ánh xạ

| Nếu phiên này đụng vào | Phải cập nhật |
|---|---|
| Thêm/xoá endpoint | `docs/kiem-thu-bao-mat/01-GIAI-DOAN-1-KIEM-KE.md`, `server/README.md` |
| Đổi giới hạn nghiệp vụ (rate limit, quota, kích thước) | Bảng §2.2 của `01-GIAI-DOAN-1-KIEM-KE.md` |
| Đổi biến môi trường | `.env.example`, `server/.env.example`, `render.yaml`, `README.md` |
| Đổi schema DB | File `database/nang_cap_vXX.sql` mới + `README.md` (thứ tự import) |
| Quyết định kiến trúc | ADR mới trong `docs/adr/` |
| Vá bảo mật | `buglogs/` (nội bộ). `docs/CHANGELOG-BAO-MAT.md` chỉ cập nhật **sau khi** đã retest xong |
| Thêm/bớt test | Không chép số vào đâu cả — tài liệu chỉ ghi *lệnh đếm* |

## Bước 6 — Ghi nợ kỹ thuật phát sinh

Mọi thứ nhìn thấy trong phiên nhưng **cố ý không sửa** → thêm dòng vào `docs/NO-KY-THUAT.md`.

Đây là nơi trả giá cho luật "không sửa ngoài phạm vi". Không ghi lại thì luật đó thành ra
chỉ là bỏ qua vấn đề.

Nếu là lỗ hổng bảo mật → mở `buglogs/bugs/BUG-xxx.md`, **không** ghi vào `NO-KY-THUAT.md` công khai.

## Bước 7 — Ghi việc còn dở cho phiên sau

Viết ngắn, đủ để một phiên hoàn toàn mới đọc là vào việc được:

- Đang dở ở đâu, file nào, dòng nào
- Đã thử cách gì rồi, kết quả sao
- Bước tiếp theo nên là gì
- Cạm bẫy đã phát hiện

Viết cho **người lạ**, không viết cho chính mình. Phiên sau không nhớ gì về phiên này.

## Bước 8 — Chốt phiên

Tóm tắt cho người dùng, đúng bốn dòng:

```
PHIÊN <mã> — <XONG / XONG MỘT PHẦN / KHÔNG COMMIT / BỎ DỞ>
ĐÃ LÀM: <ngắn gọn>
COMMIT: <danh sách SHA, hoặc "chưa commit — vướng DoD mục N">
PHIÊN SAU NÊN: <đề xuất một câu>
```

Nếu có phần nào chưa xong hoặc chưa kiểm chứng được, nói thẳng ở đây. Đừng để nó lẫn vào
phần "đã làm".
