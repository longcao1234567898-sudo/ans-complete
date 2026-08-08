# Nhật ký bản vá bảo mật khẩn cấp — 2026-08-03 (nhánh `LOC`)

> Tài liệu này ghi lại một đợt vá bảo mật lớn đã hoàn tất. Giữ lại để người
> sau hiểu **vì sao** hệ thống được thiết kế như hiện tại (fail-safe, không có
> giá trị mặc định cho khoá bí mật, IP không tin theo header client...).
> Không sửa lại nội dung lịch sử này — nếu phát hiện vấn đề mới, ghi vào mục
> "Còn tồn đọng" trong [README chính](../README.md) hoặc tạo ADR mới trong
> `docs/adr/`.

Hệ thống trước bản vá đang **phơi dữ liệu tố giác tội phạm ra Internet** (2 router quản trị không xác thực, JWT_SECRET hard-code công khai trong repo, IP giả mạo được nên mọi hạn mức chống spam và cảnh báo dò mật khẩu vô hiệu, tin "ẩn danh" thực chất dò ngược được danh tính). Dưới đây là tóm tắt những gì đã sửa (tài liệu phân tích đầy đủ giữ ở máy nội bộ, không đưa lên repo công khai).

**Nguyên tắc xuyên suốt**: khi phân vân giữa hai phương án, luôn chọn phương án bảo vệ người tố giác — kể cả khi đó là làm hệ thống **từ chối phục vụ** thay vì âm thầm hoạt động sai (fail-safe, không fail-open).

## Giai đoạn 0 — làm cho chạy được
- **B1**: `server/src/lib/ai.js` thiếu export `geminiAnalyze`/`geminiModerateImage` mà `routes/ai.js` lại import → ESM ném `SyntaxError`, backend chết ngay lúc khởi động. Đã viết bổ sung 2 hàm này (tái dùng `callOnce`/`callGemini` sẵn có); nội dung tố giác vẫn phân tích **nội bộ**, không gửi ra Google.
- **B2**: `src/App.tsx` import `./pages/admin/AdminQRPage` — file không tồn tại lúc đó, `npm run build` chết ở bước `tsc`. Đã gỡ route/menu liên quan. *(Trang này đã được viết lại và đưa trở lại ở `src/pages/admin/AdminQrPage.tsx` trong đợt nâng cấp V10 — mã QR định vị hiện trường.)*

## Giai đoạn 1 — CRITICAL
- **C1**: `routes/admin/kiosk.js` và `routes/admin/trash.js` quên gắn `requireAuth` → đọc/ghi được toàn bộ thùng rác (gồm tin tố giác) và chèn tin "đã xác minh tại trụ sở" **không cần đăng nhập**. Chốt `requireAuth` ở tầng router cha `routes/admin/index.js` để không router con nào quên được nữa.
- **C2**: `JWT_SECRET` có giá trị mặc định hard-code trong mã nguồn công khai trên GitHub → ai đọc repo cũng tự ký được token admin. Bỏ hẳn giá trị mặc định, bắt buộc ≥ 32 ký tự, thiếu thì server từ chối khởi động. `render.yaml` bổ sung `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`, `TURNSTILE_SECRET_KEY`.
- **C3**: 8 nơi trong mã nghiệp vụ đọc IP từ header `X-Forwarded-For` do **client tự đặt** (giả mạo được bằng một dòng `curl -H`), vô hiệu mọi hạn mức chống spam và làm mù cảnh báo dò mật khẩu. Thêm `clientIp(req)` dùng `req.ip` (đã đi qua `trust proxy`), thay thế đủ 8 vị trí.
- **C4**: SĐT/email băm bằng SHA-256 trần (miền giá trị SĐT di động VN chỉ ~10⁸, dò ngược mất vài phút) → phá vỡ lớp mã hoá AES-256-GCM ngay bên cạnh. Thêm `hashIdentifier()` dùng HMAC với `HASH_PEPPER` (biến môi trường, không nằm trong DB). IP và User-Agent của người gửi ẩn danh không còn lưu dạng chữ trần. Bỏ `SELECT s.*` ở endpoint chi tiết — trước đây spread thẳng cả `ip_address`/`user_agent` vào response cho mọi cán bộ.

## Giai đoạn 2 — HIGH
- **H1**: `authorize('admin','manager')` cho `POST /:id/reveal` và toàn bộ `/reports/*` — trước đây mọi cán bộ `handler` đều xem được danh tính đầy đủ và xuất được 2000 dòng nội dung tin báo.
- **H2**: `/reveal` giờ chỉ cho `admin` hoặc cán bộ **được phân công đúng hồ sơ đó** — chống cán bộ tha hoá tra danh tính hồ sơ mình không phụ trách. Giao diện hiện lỗi 403 rõ ràng ngay dưới nút, không còn trắng màn hình.
- **H3**: gỡ nhánh gọi thẳng OpenAI/Gemini từ trình duyệt — key bị Vite inline thẳng vào bundle JS (ai mở DevTools cũng lấy được), và ảnh bằng chứng của dân bị gửi thẳng sang Google. Chỉ còn đường qua backend (`/api/ai/chat`, `/api/ai/moderate-image`).
- **H4**: kết nối MySQL với `DB_SSL=true` trước đây **không xác thực chứng chỉ** (`rejectUnauthorized: false`) → chống nghe lén thụ động nhưng không chống man-in-the-middle. Nay xác thực CA hệ thống, hỗ trợ thêm `DB_SSL_CA_PEM` để dán trực tiếp nội dung PEM (Render không có filesystem cố định để trỏ đường dẫn file).
- **H5**: access token của cán bộ chuyển từ `sessionStorage` (đọc được bằng một dòng JavaScript, dễ bị đánh cắp qua XSS) sang biến trong RAM; phiên đăng nhập khôi phục qua cookie refresh `httpOnly` khi tải lại trang. Xoá cặp `authService.ts` + `useAuth.tsx` — bản an toàn hơn nhưng không nơi nào dùng, còn bản kém an toàn (`adminService.ts`) mới là bản chạy thật.
- **H6**: [`docs/adr/001-pham-vi-du-lieu-theo-don-vi.md`](adr/001-pham-vi-du-lieu-theo-don-vi.md) — ghi rõ hệ thống hiện giả định **một đơn vị/một database**; nếu gộp nhiều đơn vị dùng chung DB thì cần thêm `unit_id` và đây sẽ là IDOR ngang nghiêm trọng ngay lập tức.

## Kiểm chứng (tại thời điểm vá, 2026-08-03)
- 187 test (`server/tests/`, chạy bằng `node --test`, không cần MySQL). *(Bộ test đã tăng lên theo thời gian — số hiện tại nằm ở [README chính](../README.md).)*
- Mỗi lỗ hổng có test hồi quy — đã tự kiểm chứng bằng cách revert từng phần bản vá và xác nhận test tương ứng chuyển đỏ.
- Có thêm bộ test khoá lại 10 quyết định bảo mật đúng đắn đã tồn tại từ trước (không khoá tài khoản khi sai mật khẩu, luôn chạy `bcrypt.compare` kể cả khi không tìm thấy user, cookie `secure` mặc định bật, v.v.) để không ai vô tình phá khi sửa code sau này.

## Việc người vận hành phải tự làm (agent không tự làm được)
1. Đặt `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` thật trên Render (`openssl rand -hex 32`).
2. `TRUNCATE TABLE refresh_tokens;` — huỷ mọi phiên cấp bằng secret cũ.
3. Đổi mật khẩu tài khoản `admin`: `node scripts-create-admin.js <mật_khẩu_mới>`.
4. Rà bảng `staff` xem có tài khoản lạ không (kẻ tấn công có thể đã tự tạo bằng token giả).
5. Nạp CA vào `DB_SSL_CA_PEM` **trước khi** deploy bản vá — nếu không, backend không kết nối được MySQL cloud.
6. Thu hồi key AI nếu từng đặt vào `VITE_OPENAI_API_KEY`/`VITE_GEMINI_API_KEY` trên bản deploy cũ.

## Tồn đọng tại thời điểm đó (đã xử lý hoặc còn mở — xem README chính để biết trạng thái mới nhất)
- `npm run build` (frontend) lúc đó KHÔNG chạy được — 10 lỗi TypeScript có sẵn từ trước bản vá, đáng chú ý nhất là `VoiceInput.tsx` bị import nhưng không tồn tại. Đây là lỗi tính năng, không phải lỗi bảo mật nên không được vá cùng đợt. **Đã sửa sau đó** — `npm run build` hiện chạy sạch.
- Stored procedure `check_spam` trong `database/hop_thu_an_ninh_so.sql` là code chết (backend không gọi, so sánh SĐT plaintext với cột đã mã hoá nên không bao giờ khớp) — tình trạng hiện tại xem README chính.
