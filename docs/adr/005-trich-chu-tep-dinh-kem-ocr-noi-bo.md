# ADR 005 — Trích chữ tệp đính kèm bằng OCR nội bộ

- **Trạng thái**: Đã chấp nhận — **bổ sung mục 8** (Word .doc, phông VNI, OCR 30 trang, che tệp hồ sơ đã xoá danh tính — P55, 2026-10-05)
- **Ngày**: 2026-10-04
- **Người quyết định**: người vận hành, phiên P52 ("tích hợp OCR nội bộ nhằm chuẩn hoá nội dung file
  Word, PDF hay hình ảnh cho cán bộ tìm thông tin hay đọc", rồi "thêm OCR cả tiếng Anh"). Claude đề
  xuất phương án
- **Liên quan**: `lib/tai-lieu-an-toan.js` (kiểm tài liệu lúc nhận), ADR-003 (phạm vi xem, nhật ký)
- **Mở**: ND-052 (giới hạn đọc chữ còn lại); BUG-029 đã vá P55, chờ RETEST (nội bộ, `buglogs/`)

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
| PDF scan | Trang không có chữ -> ảnh lớn nhất của trang -> OCR | Tối đa 30 trang OCR (P52: 10) |
| Ảnh JPEG/PNG/WebP | OCR | Đọc kích thước từ đầu tệp, từ chối quá 40 triệu điểm TRƯỚC khi giải mã (bom điểm ảnh) |
| Word .doc đời cũ (97–2003) | Bộ đọc Compound File + bảng mảnh tự viết (P55) | Kiểm biên mọi sector, chặn chuỗi lặp vòng, trần 30 MB, từ chối tệp có mật khẩu |
| Video, .doc thực chất là RTF/HTML | Báo "chưa hỗ trợ" | — |

**Ngôn ngữ**: mặc định tiếng Việt; chữ đọc ra trông như phần lớn tiếng Anh (dưới 8% chữ có dấu, có từ
nối tiếng Anh) thì đọc lại bằng vie+eng và giữ bản tin cậy hơn. Cán bộ chọn được vie / eng / vie+eng
khi trích lại.

### 4. Chuẩn hoá

Unicode NFC; khoảng trắng, ký tự điều khiển, dòng trống thừa; chữ gõ phông TCVN3 (.VnTime) và VNI
(VNI-Times, từ P55) chuyển sang Unicode — .docx theo phông từng đoạn chữ (chính xác), lớp chữ PDF và .doc
đoán theo dòng (chỉ dòng không có chữ Việt Unicode và có dấu hiệu sát chữ cái). Bảng TCVN3 lấy từ
`iconv TCVN5712-1`, không chép tay; bảng VNI dựng theo quy tắc rồi đối chiếu bảng độc lập (mục 8). Lưu
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
xin xoá danh tính thì chữ trong tệp của họ không được thành thứ gõ là ra. Từ P55 tệp và chữ trong tệp
của hồ sơ đó còn bị che hẳn — xem mục 8.

### 7. Giao diện

Khu "Chữ trong tệp đính kèm" ở trang hồ sơ: chữ hiện như chữ (không chèn HTML), ghi rõ cách lấy chữ và
độ tin cậy, nhắc đối chiếu bản gốc khi là OCR, tô từ khoá không dấu, chép chữ, trích lại chọn ngôn ngữ.
Ô tài liệu PDF/Word không còn là ảnh vỡ, không còn "Mở ở tab mới" — chỉ tải về.

### 8. Bổ sung P55 (2026-10-05)

Người vận hành: "trừ cái 6 ra còn lại giải quyết fix và nâng cấp hết" — gồm ND-052 và BUG-029.

**Word .doc đời cũ.** Tự đọc Compound File ([MS-CFB]) và bảng mảnh của Word ([MS-DOC] Clx) bằng vài trăm
dòng, không thêm thư viện — tệp lạ của người ngoài, đọc càng ít thứ càng ít chỗ hở. Bỏ mã trường (HYPERLINK,
PAGE), giữ chữ người đọc thấy; ô bảng cách khoảng trắng. Tệp mẫu kiểm thử do LibreOffice thật xuất.

**Phông VNI.** Chữ gốc + một ký tự dấu Latin-1 ("Coäng hoøa"). Bảng dựng theo quy tắc của bảng mã (năm dấu
thanh, mũ, trăng, móc, đ), rồi đối chiếu với một bảng độc lập (gói npm `vietnamese-conversion`, MIT): khớp
130/134 ô; bốn ô lệch (ỷ ỹ Ỷ Ỹ) bảng kia tự mâu thuẫn — trùng mã với "ì" và với dấu của "ặ". Câu mẫu VNI
trong tệp kiểm thử mã hoá bằng bảng độc lập, không bằng bảng của mình. Đoán theo dòng: dấu VNI luôn đứng
sau nguyên âm, TCVN3 dùng nhiều byte A1–BF; dòng Unicode chỉ có chữ Latin-1 ("Hoà Bình") không bị đụng.

**PDF scan 30 trang**, hết giờ tiến trình con 6 phút (P52: 10 trang, 3 phút). Hàng đợi vẫn một việc một lúc.

**Hồ sơ đã xoá danh tính (BUG-029).** Người vận hành chọn **che**, không xoá sạch — tệp có thể là chứng cứ:

- Trang chi tiết không trả tệp nào của hồ sơ đó cho bất kỳ ai — kể cả lãnh đạo — chỉ báo số tệp bị che; ảnh
  của các lần bổ sung và chữ trích trong tệp che y như vậy.
- Chỉ lãnh đạo mở được, bằng nút riêng; nhật ký ghi trước (`view_erased_attachments`), ghi không được thì
  không trả. Khu chữ trong tệp chỉ tải sau khi bấm mở.
- Lãnh đạo xoá hẳn được từng tệp chỉ chứa danh tính (vd ảnh căn cước), phải ghi lý do, nhật ký ghi trước
  (`delete_erased_attachment`); chỉ cho hồ sơ đã xoá danh tính — không thành lối tắt xoá chứng cứ. Ảnh trên
  Cloudinary xoá bằng lệnh có chữ ký (cần `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` ở máy chủ cán bộ);
  chưa xoá được bản trên kho thì không xoá ở CSDL, không báo đã xoá. Mã ảnh lấy từ chính đường dẫn đã kiểm
  (không tin mã ảnh trình duyệt người gửi tự khai); ảnh còn hồ sơ khác hay tin tức dùng thì từ chối — lãnh
  đạo không thể bị mượn tay xoá chứng cứ hồ sơ khác.
- Người dân được nói trước lúc xin xoá: ảnh, giấy tờ gửi kèm được giữ làm chứng cứ nhưng bị che — trong hệ
  thống chỉ lãnh đạo mở, có nhật ký. ("Trong hệ thống": ảnh trên Cloudinary có đường dẫn công khai, ai đã
  thấy đường dẫn trước đó vẫn mở được — che là ở tầng máy chủ.)

Đánh đổi: lãnh đạo vẫn xem được tệp chứa danh tính người đã xin xoá — bù bằng nút riêng, nhật ký và lời báo
trước cho người dân (cùng lý lẽ ADR-003: nhật ký là lớp để lãnh đạo kiểm lẫn nhau).

## Phương án đã loại

| Phương án | Vì sao loại |
|---|---|
| OCR qua dịch vụ ngoài (Google Vision, Gemini) | Tệp tố giác ra khỏi đơn vị |
| OCR trong trình duyệt cán bộ (tesseract.js + pdf.js ở trình duyệt) | Đọc PDF lạ trong phiên xem được danh tính; phải nới CSP (`wasm-unsafe-eval`) |
| Xoá sạch tệp khi xoá danh tính (P55) | Mất chứng cứ của vụ việc; người vận hành chọn che |
| Thư viện đọc .doc có sẵn (word-extractor...) | Kéo thêm mã đọc tệp lạ; định dạng chỉ cần phần bảng mảnh, tự đọc được (P55) |
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
