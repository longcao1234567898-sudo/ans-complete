# Giai đoạn 3 — Fix theo thứ tự ưu tiên

**Thời gian:** D7–D9 (18/09, 21/09, 22/09/2026)
**Đầu ra:** mỗi lỗi đã fix có một commit riêng + một Security Decision Log (với Critical/High).

| Ngày | Phạm vi |
|---|---|
| D7 — 18/09 | Toàn bộ **Critical** |
| D8 — 21/09 | Toàn bộ **High** |
| D9 — 22/09 | **Medium/Low** + hoàn tất Security Decision Log + chuẩn bị bàn giao cho người retest |

---

## 1. Thứ tự và tiêu chí

Fix theo thứ tự `Critical → High → Medium → Low`. Trong cùng mức, ưu tiên theo:
1. Lỗi ở endpoint **công khai** trước lỗi ở endpoint cần đăng nhập.
2. Lỗi làm **lộ danh tính người tố giác** trước mọi thứ khác — đó là tài sản quan trọng nhất của hệ thống này.
3. Lỗi có thể fix bằng thay đổi nhỏ, khoanh vùng gọn, trước lỗi phải sửa kiến trúc.

Nếu một lỗi Critical cần sửa kiến trúc lớn (ví dụ chuyển rate-limit store sang Redis),
**không cố nhét vào D7**. Ghi rõ trong Bug Log là `Hoãn có kiểm soát`, kèm biện pháp giảm
thiểu tạm thời (mitigation) và ngày xử lý dứt điểm.

## 2. Kỷ luật commit — bắt buộc

> Lý do tồn tại của mục này: khi AI sửa lỗi, nó hay "tiện tay" sửa thêm chỗ khác.
> Gộp commit làm mất khả năng tách bạch cái gì gây ra cái gì.

- **Một lỗi Critical = một commit.** Không gộp hai lỗi Critical vào một commit.
- Tin nhắn commit theo mẫu:
  ```
  fix(bao-mat): <mô tả ngắn> [BUG-007]

  Lỗ hổng: <một câu>
  Cách vá: <một đến hai câu>
  Ảnh hưởng: <file/luồng nào bị chạm tới>
  Kiểm chứng: <lệnh test chạy được>
  ```
- Trước khi commit, chạy `git diff --stat` và **đọc từng file trong danh sách**. File nào
  không nằm trong phạm vi lỗi đang fix → tách ra commit khác hoặc hoàn nguyên.
- Không chạy formatter/linter toàn dự án trong cùng commit với fix bảo mật — nó chôn vùi
  thay đổi thật giữa hàng nghìn dòng đổi định dạng.

## 3. Nguyên tắc kỹ thuật khi fix

| Nguyên tắc | Nghĩa cụ thể trong dự án này |
|---|---|
| **Vá gốc, không vá triệu chứng** | Thiếu `authorize()` ở một route → không chỉ thêm cho route đó, mà rà cả file và cân nhắc đặt mặc định "từ chối" ở router cha |
| **Fail-safe, không fail-open** | Thiếu cấu hình → từ chối phục vụ, không âm thầm chạy chế độ yếu. Dự án đã theo nguyên tắc này với `JWT_SECRET`/`ENCRYPTION_KEY`; fix mới phải giữ đúng |
| **Kiểm ở backend, luôn luôn** | Sửa frontend chỉ để trải nghiệm tốt hơn. Không bao giờ tính là fix |
| **Allow-list, không deny-list** | Với tên cột `ORDER BY`, loại file upload, origin CORS: liệt kê cái được phép, không liệt kê cái bị cấm |
| **Atomic cho mọi giới hạn đếm** | `SELECT COUNT` rồi `INSERT` là sai. Dùng `UNIQUE` constraint, `INSERT ... SELECT ... WHERE`, hoặc transaction có khoá hàng |
| **Không đổi hành vi nghiệp vụ khi đang vá bảo mật** | Muốn đổi luồng nghiệp vụ thì làm ở commit khác, sau đợt này |

## 4. Quy trình cho từng lỗi

1. Mở file `buglogs/bugs/BUG-xxx.md`, đọc lại kịch bản khai thác gốc.
2. **Viết test thất bại trước** (`server/tests/`) — test tái hiện đúng lỗ hổng và hiện đang fail.
   Không có test này thì Giai đoạn 4 không có gì để chạy lại.
3. Cân nhắc ít nhất **2 phương án fix**, ghi vào Security Decision Log (bắt buộc với Critical/High).
4. Sửa code.
5. Chạy `cd server && npm test` — toàn bộ phải xanh, không chỉ test mới.
6. Chạy `npm run build` ở thư mục gốc nếu có chạm frontend.
7. Commit riêng.
8. Cập nhật Bug Log: `Ngày fix`, `Người/AI thực hiện fix`, `Commit`. **Để trống ô kết quả retest** —
   người fix không được tự điền ô đó.

## 5. Bàn giao cho Giai đoạn 4 (cuối D9)

Người/AI fix chuẩn bị **gói bàn giao**, không được kèm kết luận "đã fix đúng":

- [ ] Danh sách commit theo từng mã lỗi
- [ ] Danh sách test mới thêm và lệnh chạy
- [ ] Danh sách file bị chạm tới (`git diff --stat` gộp cả đợt)
- [ ] **Danh sách luồng nghiệp vụ có nguy cơ bị ảnh hưởng** — do chính người fix liệt kê,
      để người retest biết cần thử regression ở đâu
- [ ] Ghi chú các chỗ mình **không chắc** — đây là thông tin giá trị nhất cho người retest,
      và việc thừa nhận không chắc phải được coi là làm tốt, không phải làm kém
