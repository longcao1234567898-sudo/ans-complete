---
description: Mở phiên FIX cho một BUG — test đỏ trước, vá sau, một lỗi một commit, không tự chấm bài mình
---

Mở phiên **FIX** cho: **$ARGUMENTS**

(Tham số là mã lỗi, ví dụ `BUG-002`. Để trống thì đọc `buglogs/BUG-LOG.md`, liệt kê các lỗi
trạng thái `Mới` theo thứ tự mức độ, để người dùng chọn.)

---

## ⚠️ Hai luật của phiên này

**1. Không tự chấm bài mình.** Phiên này vá xong thì **để trống Phần 3** của Bug Log. Không
viết "đã kiểm tra thấy ổn", không đổi trạng thái sang `Fixed`. Trạng thái cao nhất phiên này
được đặt là `Chờ retest`.

**2. Không vá lỗi khác.** Thấy lỗ hổng thứ hai trong lúc vá → mở BUG mới, không tiện tay vá.
Hai bản vá trong một commit thì không revert riêng được cái nào, mà bản vá bảo mật là thứ
hay phải revert nhất.

---

## Bước 1 — Nạp Bug Log, lấy đề bài từ đó

```bash
cat buglogs/bugs/<mã lỗi>.md
```

Lấy từ Phần 1: **kịch bản khai thác gốc** và **danh sách biến thể cần thử**. Bản vá phải
chặn được **cả danh sách**, không chỉ kịch bản gốc. Biến thể bị bỏ sót chính là chỗ phiên
RETEST sẽ tìm ra, và lúc đó lỗi quay lại Giai đoạn 3 với nguyên mã cũ.

Nếu Bug Log không có danh sách biến thể → **dừng**, nói với người dùng là phiên RA-SOAT
thiếu phần bắt buộc. Tự nghĩ ra biến thể rồi tự vá theo là quay về đúng chỗ luật này muốn tránh.

## Bước 2 — Viết test ĐỎ trước  ⚠️ không được bỏ qua

Viết test tái hiện lỗ hổng vào `server/tests/`, rồi chạy và **xác nhận nó đỏ**:

```bash
cd server && npm test 2>&1 | tail -20
```

Phải nhìn thấy nó đỏ bằng mắt trước khi sửa một dòng code nào.

**Vì sao thứ tự này không đảo được:** test viết sau bản vá chỉ chứng minh code chạy đúng như
tác giả nghĩ. Test viết trước, thấy đỏ, rồi thấy xanh — mới chứng minh nó thật sự kiểm đúng
lỗ hổng đó. Đây là khác biệt giữa "có test" và "test có tác dụng".

Viết test cho **mọi biến thể** trong Bug Log, không chỉ kịch bản gốc.

Ghi lại nguyên văn output đỏ vào Bug Log Phần 2. Phiên RETEST sẽ dùng nó để đối chiếu.

## Bước 3 — Vá gốc rễ, không vá triệu chứng

Trước khi sửa, trả lời một câu: **gốc rễ nằm ở đâu?**

| Vá triệu chứng | Vá gốc rễ |
|---|---|
| Thêm `authorize()` cho đúng route bị phát hiện | Đặt mặc định từ chối ở router cha, rồi mở ra từng route |
| Chặn đúng chuỗi trong ví dụ khai thác | Chuyển sang allow-list |
| Thêm `if` chặn trường hợp vừa thấy | Sửa chỗ sinh ra dữ liệu sai |

Nhắc lại ba luật dễ vi phạm nhất khi vá:
- **Fail-safe, không fail-open** — thiếu cấu hình thì từ chối phục vụ
- **Allow-list, không deny-list**
- **Mọi giới hạn đếm phải atomic** — `SELECT COUNT` rồi `INSERT` là lách được

Đụng `server/src/` thì kiểm cả ba biến thể khởi động (ND-010).

## Bước 4 — Xác nhận xanh, và xanh vì lý do đúng

```bash
cd server && npm test
npm run build
```

Ba điều phải đúng:
1. Test mới chuyển xanh
2. **Toàn bộ** bộ test vẫn xanh — không chỉ test mới
3. `git stash` bản vá, chạy lại, test mới **phải đỏ lại**. Không đỏ lại nghĩa là test không
   kiểm gì cả. Nhớ `git stash pop`.

## Bước 5 — Trọng tài subagent — lớp sàng đầu

Trước khi commit, gọi một subagent đọc bản vá **mà không kể cho nó nghe ý định của mình**.

Đề bài chỉ gồm bốn thứ, chép từ Bug Log chứ không viết lại theo trí nhớ:
1. Kịch bản khai thác gốc và danh sách biến thể
2. `git diff` của bản vá
3. Câu hỏi: *lỗ hổng này còn khai thác được bằng biến thể nào không?*
4. Yêu cầu: kết luận phải kèm output lệnh, không kèm thì không tính

**Không** nói bản vá làm gì, **không** nói mình nghĩ nó đúng. Subagent khởi động không có
ký ức về cuộc hội thoại này — đó là điểm mạnh duy nhất của nó, đừng phá bằng cách mớm lời.

Đây là **mức độc lập nhẹ** (xem `docs/QUY-TRINH-LAM-VIEC.md` §2.2). Nó **không thay thế**
phiên `/phien-retest` cho `Critical` và `High` — nó chỉ để bản vá hỏng lộ liễu không tốn
thêm một phiên mới bị bắt.

Subagent tìm ra vấn đề → quay lại bước 3. Không tìm ra → đi tiếp, và **vẫn phải retest**.

## Bước 6 — Security Decision Log

Với `Critical` và `High`, lập `buglogs/quyet-dinh/SEC-DEC-xxx.md` theo `_MAU-SEC-DEC.md`.

Ghi **đánh đổi đã chấp nhận**, không chỉ ghi đã làm gì. Ví dụ: "hỏi database mỗi request,
đệm 30 giây — đổi 30 giây trễ khi khoá tài khoản lấy việc không thêm một truy vấn cho mỗi
lượt gọi API". Đánh đổi không ghi lại sẽ thành quyết định ngầm, và người sau gỡ nó ra mà
không biết mình đang gỡ cái gì.

## Bước 7 — Commit, một lỗi một commit

```
Va <mo ta ngan> [BUG-xxx]

VAN DE: <mot cau>
CACH SUA: <mot den hai cau — noi ro va goc re hay va trieu chung>
ANH HUONG: <file/luong nao bi cham>
KIEM THU: <n/n dat> · TypeScript: <n loi> · test moi do truoc khi va: <co/khong>
```

Dòng cuối là bắt buộc. Nó là thứ phiên RETEST đọc đầu tiên.

## Bước 8 — Cập nhật Bug Log Phần 2, để trống Phần 3

Điền Phần 2: ngày vá · người vá · SHA commit · gốc rễ · **luồng có nguy cơ ảnh hưởng** ·
output test đỏ trước khi vá.

Đổi trạng thái trong `buglogs/BUG-LOG.md` sang `Chờ retest`. **Không** đặt `Fixed`.

Báo người dùng: bản vá đã xong, **chưa được xác nhận**, và bước tiếp theo là mở một phiên
Claude hoàn toàn mới rồi chạy `/phien-retest <mã lỗi>` ở đó.
