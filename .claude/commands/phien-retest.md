---
description: Mở phiên RETEST độc lập cho một BUG đã vá — kiểm chứng bản vá mà không tin lời phiên đã fix
---

Mở phiên **RETEST độc lập** cho: **$ARGUMENTS**

(Tham số là mã lỗi, ví dụ `BUG-007`. Nếu để trống, đọc `buglogs/BUG-LOG.md` và liệt kê các
lỗi đang ở trạng thái `Chờ retest` để người dùng chọn.)

---

## ⚠️ Điều kiện tiên quyết — đọc trước khi làm bất cứ gì

Phiên này tồn tại để bắt lỗi do **chính AI gây ra trong lúc fix**. Nó chỉ có giá trị nếu
thật sự độc lập.

**Nếu phiên hiện tại đã từng sửa BUG này** — dù chỉ một dòng, dù ở đầu cuộc hội thoại —
thì **dừng lại**. Nói với người dùng: cần mở một phiên Claude hoàn toàn mới rồi chạy lại
lệnh này ở đó.

Lý do không phải là hình thức. Một phiên vừa bỏ công sửa xong đang ở trạng thái cần chứng
minh mình làm đúng. Trạng thái đó khiến nó đọc diff của chính mình một cách khoan dung,
chạy đúng những test nó biết sẽ pass, và diễn giải kết quả mơ hồ theo hướng có lợi. Đây là
vấn đề cấu trúc, không phải vấn đề cố gắng hay thiện chí.

**Chỉ được nạp ba thứ:**
1. `buglogs/bugs/<mã lỗi>.md` — Phần 1 (phát hiện) và Phần 2 (fix)
2. `git diff` / `git show` của (các) commit vá
3. Bộ test trong `server/tests/`

**Tuyệt đối không** đi tìm đọc lại lời giải thích của phiên đã fix, không hỏi "phiên trước
định làm gì", không giả định diff là đúng.

---

## Bước 1 — Nạp ngữ cảnh tối thiểu

```bash
cat buglogs/bugs/<mã lỗi>.md
git log --oneline --all --grep="<mã lỗi>"
git show <SHA bản vá> --stat
```

Đọc **kịch bản khai thác gốc** và **các biến thể cần thử** từ Bug Log — lấy từ đó, không lấy
từ mô tả của người fix.

## Bước 2 — Chạy lại đúng kịch bản khai thác gốc

Chạy **nguyên văn** kịch bản trong Bug Log. Không sửa cho "hợp với fix mới".

⚠️ Nếu kịch bản gốc không còn chạy được vì API đã đổi → **đây là tín hiệu đáng ngờ**, phải
làm rõ trước khi kết luận. Hai khả năng khác hẳn nhau:
- Bản vá đã bịt lỗ hổng, hoặc
- Bản vá chỉ đổi đường dẫn, khiến test cũ không tới được chỗ cần thử

Không được mặc định là khả năng thứ nhất.

## Bước 3 — Thử các biến thể

Chạy **ít nhất hai biến thể** ghi trong Bug Log. Nghĩ thêm biến thể mới nếu thấy chỗ hở.

Fix của AI hay chỉ chặn đúng chuỗi trong ví dụ: chặn `../` nhưng không chặn `..%2f`;
chặn `role: 'admin'` nhưng không chặn `role: ['admin']`; chặn chữ thường nhưng không chặn chữ hoa.

## Bước 4 — Để test tự động làm trọng tài

```bash
cd server && npm test
```

Kiểm ba điều:
1. **Test tái hiện lỗ hổng có tồn tại không?** Quy trình yêu cầu viết test đỏ **trước** khi fix. Không có test đó → ghi ngay là thiếu sót của phiên FIX.
2. **Test đó có thật sự kiểm đúng lỗ hổng không**, hay chỉ kiểm một thứ gần giống?
3. **Toàn bộ bộ test xanh chứ?** Không chỉ test mới.

Phép thử mạnh nhất: `git stash` bản vá, chạy lại test, xác nhận test **chuyển đỏ**. Test không
đỏ khi gỡ bản vá là test không kiểm gì cả.

## Bước 5 — Đọc diff dòng-by-dòng

Không đọc mô tả rồi tin. Đọc code. Soi theo bảng:

| Dấu hiệu | Vì sao đáng ngờ |
|---|---|
| File bị chạm ngoài phạm vi lỗi | "Tiện tay sửa thêm" — nguồn lỗi mới số một |
| Kiểm tra bị nới lỏng ở chỗ khác | Vá chỗ A bằng cách nới chỗ B |
| `catch {}` mới nuốt lỗi im lặng | Biến lỗi thành fail-open |
| `&&` đổi thành `\|\|` | Cách kinh điển làm hỏng kiểm quyền |
| Test bị sửa thay vì thêm | Sửa kỳ vọng cho khớp code sai |
| `authorize()` bị bỏ hoặc thêm vai trò | Nới quyền cho "chạy được" |
| Biến môi trường mới có mặc định | Mặc định thường yếu → fail-open |
| Comment "tạm thời", "TODO", "xử lý sau" | Vá triệu chứng, không vá gốc |

Hỏi thêm một câu quan trọng: **bản vá này vá gốc rễ hay vá triệu chứng?**
Ví dụ: thiếu `authorize()` ở một route — chỉ thêm cho route đó là vá triệu chứng; rà cả file
và đặt mặc định từ chối ở router cha mới là vá gốc.

## Bước 6 — Kiểm hồi quy

Chạy lại trọn các luồng nghiệp vụ liên quan, không chỉ điểm vừa sửa:

| Luồng | Bước tối thiểu |
|---|---|
| Gửi ý kiến ẩn danh | Xin mã → xác thực → gửi → nhận mã tra cứu → tra cứu được |
| Gửi có danh tính | OTP email → xác thực → gửi kèm ảnh → cán bộ thấy đơn |
| Đăng nhập cán bộ | Đăng nhập → refresh → thao tác → đăng xuất → token cũ hết tác dụng |
| Xem danh tính | Admin xem được · cán bộ được phân công xem được · cán bộ khác **bị chặn** · cả 3 lượt vào nhật ký |
| Xử lý đơn | Đổi trạng thái → phân công → duyệt → đánh spam → thùng rác → khôi phục |
| Chat | Mở phòng → dân gửi → cán bộ trả lời → hai bên đọc đúng |
| Chặn spam | Thiết bị bị khoá vẫn gửi được, đơn vẫn lưu, vẫn đánh `is_spam`, cán bộ xem lại được |

Chọn luồng theo vùng code bị chạm trong diff. Nếu phiên FIX có liệt kê "luồng có nguy cơ ảnh
hưởng" trong Bug Log Phần 2, chạy hết những luồng đó — nhưng đừng coi danh sách đó là đầy đủ.

## Bước 7 — Kết luận và ghi Bug Log Phần 3

Ghi đúng **một** trạng thái:

| Trạng thái | Khi nào | Hành động tiếp |
|---|---|---|
| `Fixed` | Kịch bản gốc + mọi biến thể đều bị chặn, không hồi quy, test đỏ đúng khi gỡ vá | Đóng lỗi |
| `Fixed nhưng phát sinh lỗi mới` | Lỗ hổng gốc hết nhưng sinh vấn đề khác | **Mở BUG mới**, ghi `Sinh ra bởi: fix của <mã>`, quay lại Giai đoạn 3 |
| `Chưa fix triệt để` | Còn biến thể khai thác được, hoặc chỉ vá triệu chứng | Quay lại Giai đoạn 3, **giữ nguyên mã lỗi cũ** |

Điền Phần 3 của `buglogs/bugs/<mã lỗi>.md`: ngày · người retest · mức độ độc lập · từng ô
checklist · **bằng chứng** (output lệnh, log test).

Kết luận không kèm bằng chứng **không được tính là đã retest**.

Nếu phát sinh lỗi mới, thêm dòng vào bảng "Lỗi phát sinh do chính quá trình fix" trong
`buglogs/BUG-LOG.md`, kèm phân loại kiểu sai. Bảng đó là số liệu cho báo cáo tổng kết —
nó chứng minh vì sao bước retest độc lập là cần thiết.

## Bước 8 — Cập nhật tiến độ

Thêm dòng phiên `RETEST` vào `docs/TIEN-DO.md`. Chỉ ghi mã `BUG-xxx` và trạng thái —
**không** mô tả lỗ hổng (file này công khai trên GitHub).

Báo người dùng kết quả, thẳng thắn. Nếu bản vá chưa đạt thì nói chưa đạt: mục đích của phiên
này là bắt lỗi, không phải xác nhận cho xong.
