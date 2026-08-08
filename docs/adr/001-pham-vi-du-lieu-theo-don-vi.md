# ADR 001 — Phạm vi dữ liệu theo đơn vị

- **Trạng thái**: Đã chấp nhận (có điều kiện)
- **Ngày**: 2026-08-03
- **Phạm vi**: toàn bộ `server/src/routes/admin/`

---

## Bối cảnh

Mọi endpoint quản trị hiện nhận `req.params.id` rồi truy vấn thẳng, **không kiểm
tra hồ sơ đó có thuộc địa bàn của cán bộ hay không**:

| File | Dòng | Thao tác |
|---|---|---|
| `routes/admin/submissions.js` | ~114 | xem chi tiết |
| `routes/admin/submissions.js` | ~155 | xem danh tính (`/reveal`) |
| `routes/admin/submissions.js` | ~191 | đổi trạng thái |
| `routes/admin/submissions.js` | ~241 | phân công |
| `routes/admin/submissions.js` | ~266 | kiểm duyệt tin ẩn danh |

Bảng `submissions` và bảng `staff` đều **không có cột `unit_id`**. Không có
thông tin nào trong dữ liệu cho phép trả lời câu hỏi "hồ sơ này thuộc đơn vị
nào".

## Quyết định

**Giữ nguyên mô hình MỘT ĐƠN VỊ / MỘT DATABASE.** Mọi cán bộ trong database
thấy được mọi hồ sơ trong database đó.

Không thêm cột `unit_id` ở thời điểm này.

## Vì sao chấp nhận được hôm nay

Một xã chạy một database riêng. Toàn bộ cán bộ trong database đó vốn dĩ **cùng
một đơn vị**, đã có quyền nghiệp vụ với mọi hồ sơ của địa bàn mình. Việc thiếu
kiểm tra `unit_id` vì thế không mở rộng quyền của ai so với quyền họ đã có.

Lạm dụng **trong nội bộ một đơn vị** đã được siết bằng lớp khác, không phải bằng
`unit_id`:

- `/reveal` yêu cầu vai trò `admin` hoặc `manager` (H1)
- `/reveal` còn yêu cầu **đúng cán bộ được phân công**, trừ `admin` (H2)
- Mọi lượt xem danh tính đều ghi `staff_activity_logs` trước khi trả dữ liệu

## Điều kiện biến nó thành lỗ hổng nghiêm trọng

Ngay khi **hai đơn vị trở lên dùng chung một database**, thiếu sót này trở thành
lỗ hổng IDOR ngang **có thể khai thác ngay lập tức**: cán bộ xã A chỉ cần đổi số
`id` trên URL là đọc được tin tố giác của xã B, gồm cả bước `/reveal` nếu họ là
`manager` và hồ sơ tình cờ chưa phân công cho ai.

Ba tình huống dẫn tới điều đó, đều **không** trông giống một thay đổi bảo mật
lúc bàn bạc:

1. Gộp database để tiết kiệm chi phí hosting
2. Triển khai lên cấp huyện/tỉnh, dùng chung một instance MySQL
3. Nhân bản hệ thống cho xã thứ hai nhưng trỏ vào cùng `DB_NAME`

## Nếu chuyển sang đa đơn vị thì phải làm gì

1. Thêm cột `unit_id` vào **cả** `submissions` và `staff`
2. `requireAuth` gắn `req.staff.unitId` từ payload token
3. **Mọi** truy vấn admin kèm `AND s.unit_id = ?` — kể cả truy vấn đếm, báo cáo,
   thùng rác, và `/api/health/schema`
4. Kiểm tra ở tầng router cha (giống cách `requireAuth` được chốt ở
   `routes/admin/index.js`), không giao cho từng endpoint tự nhớ

## Cảnh báo chi phí — đọc trước khi hoãn

Thêm `unit_id` **sau khi đã có dữ liệu thật** tốn kém hơn nhiều lần so với thêm
từ đầu: phải xác định lại đơn vị cho từng bản ghi lịch sử (mà tin ẩn danh thì
gần như không còn manh mối nào để suy ra), phải sửa đồng loạt hàng chục truy vấn,
và **bỏ sót một truy vấn là còn nguyên lỗ hổng** trong khi mọi thứ vẫn chạy bình
thường nên không ai phát hiện.

**Vì vậy: quyết định có đa đơn vị hay không càng sớm càng tốt**, đừng để tới lúc
đã có dữ liệu tố giác thật trong bảng.
