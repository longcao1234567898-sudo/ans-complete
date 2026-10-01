# ADR 002 — Mô hình vai trò cho Công an cấp xã

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-09-27
- **Người quyết định**: Loc (người vận hành), phiên P38. Claude Opus 5.5 đề xuất phương án
- **Khép**: nợ kỹ thuật ND-030
- **Liên quan**: [ADR 001](001-pham-vi-du-lieu-theo-don-vi.md) (một đơn vị, một database)

---

## Bối cảnh

Hệ thống có ba vai trò `admin`, `manager`, `handler`. Quyền của từng vai trò hình thành dần qua
từng bản vá, không theo một bảng nghiệp vụ được duyệt. Người vận hành hỏi ba vai trò ứng với ai
ngoài đời và ai nên phân công.

Hai điều kiện của Công an cấp xã chi phối quyết định:

- **Quân số ít.** Thường chỉ có Trưởng, một hai Phó và vài cán bộ; một người kiêm nhiều việc.
  Mô hình nhiều vai trò (tách trực ban, thụ lý, quản trị kỹ thuật) quá nặng.
- **Lãnh đạo không gánh được việc tiếp nhận.** Lãnh đạo giao việc, xem báo cáo, nghiệm thu. Bắt
  lãnh đạo mở từng hồ sơ để giao, hay tự duyệt tin, là biến lãnh đạo thành người trực tiếp nhận.

## Quyết định

### 1. Giữ ba vai trò, gọi tên theo nghiệp vụ

| Người ngoài đời | Vai trò | Nhãn trên giao diện |
|---|---|---|
| Trưởng Công an xã | `admin` | Quản trị viên |
| Phó trưởng | `manager` | Cán bộ quản lý |
| Các cán bộ, chiến sĩ còn lại | `handler` | Cán bộ xử lý |

Không đổi ENUM `staff.role`, không migration.

### 2. Quyền xem giữ nguyên như hiện tại

| | Trưởng | Phó | Cán bộ |
|---|---|---|---|
| Nội dung hồ sơ mức Thường | Có | Có | Có (ADR 001) |
| Danh tính người gửi (tên, SĐT, email) | Có, mỗi lượt ghi nhật ký | Chỉ hồ sơ **Trưởng** giao cho mình | Không bao giờ |
| Giao hồ sơ cho | Bất kỳ ai | Chỉ cán bộ | Không |
| Nhật ký, báo cáo | Có | Có | Không |

Danh tính đi theo Trưởng, không theo chức vụ lãnh đạo nói chung: Phó chỉ xem được khi Trưởng chủ
động uỷ quyền bằng cách giao hồ sơ (ví dụ khi Trưởng vắng mặt). Không vai trò nào tự nới được phạm
vi xem danh tính của mình.

### 3. Cấp độ bảo mật hồ sơ

| Mức | Ai đọc được |
|---|---|
| Thường | Mọi cán bộ |
| Mật | **Chỉ Trưởng và người được Trưởng giao** hồ sơ đó |
| Cần bảo vệ | Trưởng, Phó, và người được giao hồ sơ đó *(Loc chốt 2026-09-28, P44)* |

- Chỉ Trưởng đặt hoặc hạ mức Mật.
- Mức Mật **hẹp hơn** mô tả cũ ("chỉ lãnh đạo") một cách cố ý: ở cấp xã, một tố giác có thể nhắm
  vào chính Phó trưởng.
- Mức Mật là ngoại lệ cho vụ đặc biệt. Phần lớn hồ sơ vẫn ở mức Thường, ai cũng đọc được.

### 4. Giao việc: thêm giao theo lô

Lãnh đạo chọn nhiều hồ sơ trên danh sách rồi giao một lần cho một cán bộ, thay cho mở từng hồ sơ.

Ràng buộc: giao theo lô là **một đường ghi người phụ trách mới**, nên phải đi qua đúng luật của
giao lẻ (Phó chỉ giao cho cán bộ), kiểm ở backend, ghi nhật ký từng hồ sơ. Giao theo lô không được
thành cách để Phó tự đưa mình hoặc Phó khác vào phạm vi xem danh tính.

### 5. Hàng chờ tin ẩn danh: giữ như hiện nay

Mọi cán bộ duyệt được tin ẩn danh ở hàng chờ. Không gắn tên người chịu trách nhiệm cho từng tin.

### 6. Quy tắc vận hành

- **Tài khoản `admin` do Trưởng Công an xã giữ**, không giao cho người lo kỹ thuật.
- Xã không có Phó thì không tạo tài khoản `manager`.
- Trước khi nâng ai lên `manager`: gỡ hoặc để Trưởng giao lại các hồ sơ người đó đang giữ.
- Hạ vai trò ai thì **khoá tài khoản người đó cùng lúc**, rồi mở lại với vai trò mới.
- Người giữ máy chủ có quyền thực tế ngang `admin` (khoá giải mã nằm trên máy chủ). Chọn người giữ
  máy chủ cẩn thận như chọn người giữ tài khoản `admin`.

## Phương án đã cân nhắc nhưng không chọn

Ghi lại để phiên sau không bàn lại từ đầu.

| Phương án | Vì sao không chọn |
|---|---|
| Năm vai trò: Trưởng, Phó, thụ lý, trực ban, quản trị kỹ thuật | Quá nặng cho quân số cấp xã |
| Cán bộ chỉ đọc hồ sơ được giao cho mình | Xã ít người, cán bộ phải làm thay nhau được. Giữ ADR 001 |
| Cán bộ được giao tự xem danh tính | Mất lớp "cán bộ không bao giờ tự tra được người báo"; ở xã ai cũng quen nhau |
| Bỏ vai trò Phó | Ngoài Trưởng, chỉ Phó đọc được nhật ký — bỏ Phó thì trong hệ thống không còn ai kiểm lại được Trưởng |
| Gỡ nhãn Mật, ai cũng đọc hết | Lãnh đạo cần công cụ cho vụ đặc biệt, ví dụ tố giác chính cán bộ trong đơn vị |
| Tự động giao theo địa bàn, chia đều theo khối lượng, giao theo lĩnh vực | Chưa chọn ở đợt này. Có thể xét lại sau khi giao theo lô chạy thực tế; nếu làm thì chịu cùng ràng buộc ở mục 4 |
| Lịch trực ban hoặc nút "Nhận xử lý" cho hàng chờ tin ẩn danh | Chưa chọn. **Hệ quả chấp nhận:** không tin nào trong hàng chờ mang tên người chịu trách nhiệm; lãnh đạo theo dõi hàng chờ qua bảng điều hành |

## Hệ quả

- Không đổi cơ sở dữ liệu vai trò. Công việc còn lại, theo thứ tự:
  1. Triển khai chính sách cấp độ bảo mật ở mục 3 (chốt mức Cần bảo vệ trước khi viết mã).
     *Đã triển khai ở P44 (BUG-009, `8fe31c4`); RETEST độc lập P45 kết luận `Fixed`.*
  2. Giao theo lô (mục 4) — phiên `TINH-NANG`.
  3. *Đề xuất, chưa chốt:* bắt buộc nhập lý do khi xem danh tính; chỉ lãnh đạo được đóng hồ sơ
     (nghiệm thu). Người vận hành quyết trước khi mở phiên.
- Chuyển sang nhiều đơn vị dùng chung một database (cấp tỉnh) thì xem lại cả ADR này lẫn ADR 001.
