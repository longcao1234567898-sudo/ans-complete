# ADR 005 — Trích chữ tệp đính kèm bằng OCR nội bộ

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-10-04
- **Người quyết định**: người vận hành, phiên P52 ("tích hợp OCR nội bộ nhằm chuẩn hoá nội dung file
  Word, PDF hay hình ảnh cho cán bộ tìm thông tin hay đọc", rồi "thêm OCR cả tiếng Anh"). Claude đề
  xuất phương án
- **Liên quan**: `lib/tai-lieu-an-toan.js` (kiểm tài liệu lúc nhận), ADR-003 (phạm vi xem, nhật ký)
- **Mở**: ND-052 (giới hạn đọc chữ); BUG-029 (nội bộ, `buglogs/`)

---

## Bối cảnh

Người dân gửi kèm đơn Word, PDF, ảnh chụp giấy tờ (tối đa 3 ảnh + 3 tài liệu mỗi tin). Cán bộ phải
tải từng tệp về mở, không tìm được nội dung trong tệp. `lib/tai-lieu-an-toan.js` lại dặn **không bao
giờ mở tài liệu trên trình duyệt cán bộ** — PDF, Word chạy được mã, mà đó là phiên đăng nhập xem được
danh tính người tố giác.

Kiểm trước khi làm (đo thật trong P52, ảnh và PDF mẫu toàn dữ liệu giả):

| Đo | Kết quả |
|---|---|
| OCR tiếng Việt bằng tesseract.js trong Node, mô hình nằm sẵn | Lỗi ký tự 0–0,8% trên ảnh in rõ / chụp nghiêng mờ; 0,4–0,8 giây/ảnh; ~150 MB bộ nhớ |
| Mô hình tiếng Việt đọc văn bản tiếng Anh | 0–0,3% lỗi; mô hình tiếng Anh riêng 4,2%; ghép vie+eng 0,9% |
| Ghép vie+eng đọc văn bản tiếng Việt | Kém đi: 0,6% -> 1,2%, chậm hơn |
| PDF có lớp chữ (pdf.js) | Đúng từng ký tự, ~0,1 giây |
| PDF scan (ảnh trang) -> OCR | ~2 giây/trang; pdf.js + OCR cùng lúc ~350 MB |
| PDF/Word gõ phông .VnTime | Lớp chữ ra ký tự Latin-1 ("Céng hßa") — phải chuyển mã |

Cũng phát hiện trong lúc thử: tệp Word người dân gửi **không bao giờ được lưu** — cột `mime_type`
VARCHAR(50) ngắn hơn kiểu tệp `.docx` (71 ký tự). Sửa riêng (`nang_cap_v32.sql`).

## Quyết định

### 1. Nội bộ hoàn toàn

Không gửi tệp ra dịch vụ OCR ngoài (Google Vision, Gemini…): tệp của tin tố giác có thể chứa chính
danh tính người tố giác. Mô hình ngôn ngữ đến từ gói `@tesseract.js-data/vie`, `/eng` ghim phiên bản,
có mã băm toàn vẹn trong `package-lock.json` — không tải gì lúc chạy.

### 2. Chạy ở máy chủ, trong tiến trình con

Không chạy trong trình duyệt cán bộ: thư viện đọc PDF chạy trong phiên xem được danh tính là đúng
điều phải tránh. Ở máy chủ, mọi việc đọc tệp lạ chạy trong **tiến trình con** (`lib/trich-chu/`):

- môi trường liệt kê cái được đi (allow-list): không `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`,
  mật khẩu CSDL, proxy; không kết nối CSDL — nhận byte, trả chữ;
- `oom_score_adj = 1000`: hết bộ nhớ thì nó chết trước, kênh tiếp nhận vẫn sống;
- một việc một lúc, quá 3 phút thì giết, rảnh 3 phút thì tắt (trả bộ nhớ mô hình).

Không phải hộp cát đầy đủ (cùng người dùng hệ điều hành) — là thêm một lớp, không thay việc giữ thư
viện đọc tệp luôn mới.

### 3. Đọc thế nào

| Tệp | Cách | Chặn |
|---|---|---|
| Word .docx | Đọc `word/document.xml` bằng bộ đọc ZIP tự viết (zlib có sẵn); bỏ chữ đã xoá, mã trường, bản dự phòng trùng | Trần giải nén 30 MB (bom nén); không xử lý DTD (không XXE) |
| PDF có lớp chữ | pdf.js `isEvalSupported: false`, không nạp phông | Tối đa 200 trang, trần kích thước ảnh |
| PDF scan | Trang không có chữ -> ảnh lớn nhất của trang -> OCR | Tối đa 10 trang OCR |
| Ảnh JPEG/PNG/WebP | OCR | Đọc kích thước từ đầu tệp, từ chối quá 40 triệu điểm TRƯỚC khi giải mã (bom điểm ảnh) |
| Word .doc đời cũ, video | Báo "chưa hỗ trợ" | — |

**Ngôn ngữ**: mặc định tiếng Việt; chữ đọc ra trông như phần lớn tiếng Anh (dưới 8% chữ có dấu, có từ
nối tiếng Anh) thì đọc lại bằng vie+eng và giữ bản tin cậy hơn. Cán bộ chọn được vie / eng / vie+eng
khi trích lại.

### 4. Chuẩn hoá

Unicode NFC; khoảng trắng, ký tự điều khiển, dòng trống thừa; chữ gõ phông TCVN3 (.VnTime) chuyển sang
Unicode — Word theo phông từng đoạn chữ (chính xác), lớp chữ PDF đoán theo dòng (chỉ dòng không có chữ
Việt Unicode và có ký tự TCVN3 sát chữ cái). Bảng mã lấy từ `iconv TCVN5712-1`, không chép tay. Lưu
thêm bản không dấu để tìm.

### 5. Ai, khi nào

- **Chỉ cán bộ yêu cầu** mới có việc (`POST /api/admin/submissions/:id/trich-chu`). Người dân gửi tin
  KHÔNG kích OCR — không cho người ngoài đẩy việc nặng vào máy chủ (mô hình đe doạ 3).
- Ai **xem được hồ sơ** thì trích / đọc được chữ trong tệp của hồ sơ đó — đúng phạm vi mở chi tiết.
  Ngoài phạm vi 404. Hồ sơ mang cờ: ghi nhật ký TRƯỚC khi trả chữ, như trang chi tiết.
- Giới hạn 30 yêu cầu / 10 phút mỗi cán bộ. Nhật ký `trich_chu_tep`.

### 6. Lưu và tìm

Bảng `trich_chu_tep` (`nang_cap_v33.sql`), một dòng mỗi tệp, khoá ngoại `ON DELETE CASCADE` theo tệp
và theo hồ sơ — chữ trích không sống lâu hơn tệp gốc. Lưu dạng chữ thường như chính tệp gốc (tệp đính
kèm cũng không mã hoá trong CSDL — ND-008): mã hoá bản sao trong khi bản gốc để trần không thêm bảo vệ
thật mà mất khả năng tìm.

Ô tìm kiếm danh sách hồ sơ tìm cả chữ trong tệp (không dấu), vẫn trong phạm vi xem; hồ sơ khớp nhờ
tệp có nhãn "Khớp chữ trong tệp". **Hồ sơ đã xoá danh tính không tìm qua chữ trong tệp**: người dân đã
xin xoá danh tính thì chữ trong tệp của họ không được thành thứ gõ là ra (liên quan BUG-029).

### 7. Giao diện

Khu "Chữ trong tệp đính kèm" ở trang hồ sơ: chữ hiện như chữ (không chèn HTML), ghi rõ cách lấy chữ và
độ tin cậy, nhắc đối chiếu bản gốc khi là OCR, tô từ khoá không dấu, chép chữ, trích lại chọn ngôn ngữ.
Ô tài liệu PDF/Word không còn là ảnh vỡ, không còn "Mở ở tab mới" — chỉ tải về.

## Phương án đã loại

| Phương án | Vì sao loại |
|---|---|
| OCR qua dịch vụ ngoài (Google Vision, Gemini) | Tệp tố giác ra khỏi đơn vị |
| OCR trong trình duyệt cán bộ (tesseract.js + pdf.js ở trình duyệt) | Đọc PDF lạ trong phiên xem được danh tính; phải nới CSP (`wasm-unsafe-eval`) |
| Dịch vụ OCR riêng bằng Python (PaddleOCR, VietOCR) | Chính xác hơn với chữ Việt nhưng phải dựng thêm máy, Docker — quá nặng cho Công an cấp xã. Có thể làm sau nếu cần đọc chữ viết tay |
| Tự trích ngay lúc người dân gửi tin | Người ngoài đẩy được việc nặng vào máy chủ; chạy trên máy chủ công khai |
| Mã hoá chữ trích | Tệp gốc cùng bảng vẫn để trần — không thêm bảo vệ thật, mất khả năng tìm |

## Hệ quả

- **Thêm ba thư viện** vào máy chủ: `tesseract.js` 7.0.0, `pdfjs-dist` 4.10.38, gói mô hình vie/eng —
  ghim phiên bản. `npm audit` không thêm cảnh báo. Thư viện đọc tệp phải được cập nhật khi có bản vá.
- **Node ≥ 20** (pdf.js 4.x).
- **Bộ nhớ**: lúc OCR PDF scan, tiến trình con lên tới ~350 MB, cộng máy chủ chính ~100 MB. Máy
  512 MB (Render miễn phí) chạy được ảnh lẻ nhưng PDF scan dài có thể bị giết (tiến trình con chết,
  kênh tiếp nhận không sao, việc báo lỗi). Nên dùng máy ≥ 1 GB, hoặc `TRICH_CHU_OCR=tat` (Word, PDF
  có lớp chữ vẫn đọc).
- **OCR có thể sai**: giao diện luôn ghi độ tin cậy và nhắc đối chiếu bản gốc; chữ viết tay gần như
  không đọc được (ND-052).
- Tài khoản MySQL quyền hẹp phải cấp quyền bảng mới (ghi trong `nang_cap_v33.sql`).
