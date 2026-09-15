# Giai đoạn 4 — Kiểm thử lại (Retest) độc lập

**Thời gian:** D10–D11 (23/09 – 24/09/2026)
**Đây là giai đoạn để bắt lỗi do chính AI gây ra trong lúc fix. Không được rút gọn, không được bỏ.**

| Ngày | Phạm vi |
|---|---|
| D10 — 23/09 | Retest toàn bộ **Critical** và **High** |
| D11 — 24/09 | Retest **Medium/Low** + regression toàn hệ thống + chốt trạng thái Bug Log |

---

## 1. Nguyên tắc độc lập — điều kiện tiên quyết

> **Người/AI đã fix một lỗi không được là người xác nhận lỗi đó đã fix xong.**

Vì sao: một AI (hoặc một người) vừa bỏ công sửa xong đang ở trong trạng thái cần chứng minh
mình làm đúng. Trạng thái đó làm người ta đọc diff của chính mình một cách khoan dung,
chạy đúng những test mình biết sẽ pass, và diễn giải kết quả mơ hồ theo hướng có lợi.
Đây không phải vấn đề đạo đức, mà là vấn đề cấu trúc — nên phải giải bằng cấu trúc.

**Xếp theo thứ tự ưu tiên, chọn cái khả thi nhất:**

| Mức | Cách làm | Ghi vào Bug Log là |
|---|---|---|
| Tốt nhất | Một **người khác** retest | `Độc lập — người khác` |
| Tốt | Một **AI khác** (khác model/khác nhà cung cấp) retest | `Độc lập — AI khác` |
| Chấp nhận được | **Phiên chat mới hoàn toàn**, chỉ đưa Bug Log + diff, **không** đưa lời giải thích của AI đã fix | `Bán độc lập — phiên mới` |
| **Không chấp nhận** | Hỏi lại chính phiên đã fix "đã đúng chưa?" | ✗ |

Ở mức "phiên chat mới", prompt giao việc phải **không chứa** câu nào kiểu "đã fix xong rồi,
kiểm tra giúp". Dùng khung trung lập:

> "Đây là mã lỗi BUG-xxx với kịch bản khai thác sau: [...]. Đây là diff. Hãy tự xác định lỗ hổng
> còn khai thác được không, và diff này có tạo ra vấn đề mới nào không. Không giả định diff là đúng."

## 2. Quy trình 4 bước cho **mỗi** lỗi đã đóng ở GĐ3

### Bước 1 — Chạy lại đúng kịch bản khai thác gốc
- Lấy kịch bản **từ Bug Log**, không lấy từ mô tả của người fix.
- Chạy nguyên văn, không sửa cho "hợp với fix mới".
- Nếu kịch bản gốc không còn chạy được vì API đã đổi → đó là tín hiệu đáng ngờ, phải làm rõ
  trước khi kết luận: fix đã bịt lỗ hổng, hay chỉ đổi đường dẫn khiến test cũ không tới được chỗ cần thử?
- Thử thêm **ít nhất 2 biến thể** của kịch bản gốc. Fix của AI hay chỉ chặn đúng chuỗi trong
  ví dụ (chặn `../` nhưng không chặn `..%2f`; chặn `role: 'admin'` nhưng không chặn `role: ['admin']`).

### Bước 2 — Kiểm tra regression
Không chỉ thử điểm vừa sửa. Chạy trọn các luồng liên quan:

| Luồng nghiệp vụ | Bước tối thiểu phải chạy lại |
|---|---|
| Gửi ý kiến ẩn danh | Xin mã ẩn danh → xác thực → gửi → nhận mã tra cứu → tra cứu được |
| Gửi ý kiến có danh tính | Gửi OTP email → xác thực → gửi kèm ảnh → cán bộ thấy đơn |
| Đăng nhập cán bộ | Đăng nhập → refresh phiên → thao tác → đăng xuất → token cũ hết tác dụng |
| Xem danh tính | Admin xem được · cán bộ được phân công xem được · cán bộ khác **bị chặn** · cả 3 lượt đều vào nhật ký |
| Xử lý đơn | Đổi trạng thái → phân công → duyệt → đánh spam → vào thùng rác → khôi phục |
| Chat với người gửi | Mở phòng → người dân gửi → cán bộ trả lời → hai bên đọc đúng nội dung |
| Báo cáo & xuất Excel | Dashboard → báo cáo → xuất file mở được |
| Chặn spam | Thiết bị bị khoá vẫn gửi được, đơn vẫn lưu, vẫn bị đánh `is_spam`, cán bộ vẫn xem lại được |

Bắt buộc: `cd server && npm test` (toàn bộ, không chỉ test mới) và `npm run build` ở gốc.

### Bước 3 — Đọc lại diff dòng-by-dòng
Không đọc mô tả của AI rồi tin. Đọc code. Bảng dấu hiệu cần soi:

| Dấu hiệu trong diff | Vì sao đáng ngờ |
|---|---|
| File bị chạm nằm ngoài phạm vi lỗi | AI "tiện tay" sửa thêm — nguồn lỗi mới phổ biến nhất |
| Kiểm tra bị **nới lỏng** ở chỗ khác | Fix chỗ A bằng cách nới chỗ B cho hết lỗi test |
| `try/catch` mới nuốt lỗi im lặng (`catch {}`) | Biến lỗi thành fail-open |
| Điều kiện đảo thành `\|\|` thay vì `&&` | Cách kinh điển làm hỏng kiểm quyền |
| Test bị **sửa** thay vì thêm | Sửa kỳ vọng của test cho khớp code sai |
| `authorize()` bị bỏ, đổi vai trò, hoặc thêm vai trò | Nới quyền để "cho chạy được" |
| Biến môi trường mới có giá trị mặc định | Mặc định thường là giá trị yếu → fail-open |
| Comment kiểu "tạm thời", "TODO", "sẽ xử lý sau" | Vá triệu chứng |

### Bước 4 — Kết luận và ghi trạng thái
Ghi vào Bug Log đúng một trong ba trạng thái:

| Trạng thái | Nghĩa | Hành động |
|---|---|---|
| `Fixed` | Kịch bản gốc + biến thể đều không còn khai thác được, không có regression | Đóng lỗi |
| `Fixed nhưng phát sinh lỗi mới` | Lỗ hổng gốc đã hết nhưng sinh vấn đề khác | **Mở BUG mới**, quay lại GĐ3 |
| `Chưa fix triệt để` | Còn biến thể khai thác được, hoặc chỉ vá triệu chứng | Quay lại GĐ3, giữ nguyên mã lỗi cũ |

Người retest ghi rõ **tên mình và ngày**, kèm bằng chứng (output lệnh, ảnh chụp, log test).
Kết luận không kèm bằng chứng không được tính là đã retest.

## 3. Vòng lặp khi phát sinh lỗi mới

Bất kỳ lỗi nào phát sinh trong lúc fix → **quay lại Giai đoạn 3**, không được bỏ qua.
- Lỗi mới được cấp mã BUG riêng, ghi rõ `Sinh ra bởi: fix của BUG-xxx`.
- Fix vòng 2 phải qua lại đủ 4 bước retest, không được rút gọn vì "chỉ sửa một dòng".
- Nếu một lỗi phải fix tới **vòng 3** → dừng vá, ngồi lại xem có phải đang vá sai gốc rễ
  hoặc thiết kế chỗ đó cần sửa lại.

## 4. Đầu ra Giai đoạn 4
- [ ] Mọi lỗi ở GĐ3 đã có kết quả retest và tên người retest
- [ ] Không còn lỗi `Critical`/`High` ở trạng thái mở
- [ ] `cd server && npm test` xanh toàn bộ; `npm run build` không lỗi
- [ ] Bảng regression đã chạy đủ, có ghi nhận kết quả từng luồng
- [ ] Danh sách lỗi mới phát sinh trong lúc fix (kể cả đã fix xong) — **giữ lại để báo cáo**,
      vì đây chính là bằng chứng cho thấy vì sao bước retest độc lập là cần thiết
