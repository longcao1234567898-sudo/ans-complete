# Hộp Thư An Ninh Số

Nền tảng tiếp nhận, phân loại và xử lý ý kiến công dân bằng AI dành cho Công an xã/phường.

## Công nghệ
- React 18 + TypeScript + Vite
- Tailwind CSS (dark mode, glassmorphism, animation)
- Framer Motion (hiệu ứng chuyển động)
- TanStack React Query (quản lý dữ liệu bất đồng bộ)
- html5-qrcode (quét QR), qrcode.react (sinh QR)
- react-markdown, react-hot-toast, react-router-dom

## Chạy dự án (VS Code)
```bash
# 1. Cài dependencies (cần Node.js >= 18)
npm install

# 2. Chạy môi trường phát triển
npm run dev   # mở http://localhost:3000

# 3. Build production
npm run build
npm run preview
```

## Bật AI thật cho trợ lý hỏi đáp (tuỳ chọn)

Kể từ bản vá bảo mật 2026-08-03, **key AI chỉ đặt ở backend**, không bao giờ đặt ở frontend nữa (xem mục "Bản vá bảo mật" bên dưới, mục H3).

1. Vào https://aistudio.google.com/app/apikey (Google Gemini, có gói miễn phí), đăng nhập Gmail, bấm **Create API key**
2. Trong `server/.env`, dán vào dòng `GEMINI_API_KEY=...`
3. Khởi động lại backend (`npm run dev` trong thư mục `server/`)

Frontend gọi AI qua hai endpoint proxy của backend: `POST /api/ai/chat` (chatbot) và `POST /api/ai/moderate-image` (kiểm duyệt ảnh) — key không bao giờ lộ xuống trình duyệt.

Không có backend hoặc chưa cấu hình `GEMINI_API_KEY`: trợ lý AI vẫn hoạt động bằng bộ câu trả lời mẫu tại `src/utils/mockData.ts`, kiểm duyệt ảnh dùng heuristic cục bộ — không tính năng nào bị chặn hẳn.

## Lá chắn an toàn nội dung (`src/utils/security.ts`)
- **Văn bản**: quét mẫu tấn công (script/iframe, javascript:, on*=, SQL/template injection...), loại ký tự điều khiển và ký tự tàng hình, giới hạn 2000 ký tự — kiểm tra 2 lớp (trước khi AI phân tích và ngay trước khi lưu).
- **Hình ảnh**: xác minh chữ ký nhị phân (magic bytes) chống tệp giả mạo đuôi ảnh, từ chối SVG, chặn bom giải nén (>40MP), và **tái mã hoá toàn bộ ảnh qua canvas** để xoá mã độc ẩn trong metadata.
- Lưu ý: đây là phòng thủ phía trình duyệt; khi có backend thật phải kiểm tra lại phía máy chủ.

## Quy tắc form gửi ý kiến
- **Họ và tên**: bắt buộc
- **Số điện thoại**: bắt buộc (định dạng Việt Nam)
- **Email**: không bắt buộc

## Mã tra cứu demo
| Mã     | Trạng thái     |
|--------|----------------|
| DEMO01 | Đã tiếp nhận   |
| DEMO02 | Đang xử lý     |
| DEMO03 | Đã giải quyết  |
| DEMO04 | Từ chối        |

Ý kiến gửi mới được lưu vào localStorage và tra cứu được bằng mã 6 ký tự do hệ thống cấp.

## Tuỳ biến cho đơn vị
Sửa thông tin xã/phường (tên, địa chỉ, hotline, email) tại `src/utils/constants.ts` — hằng số `UNIT`.

## Ghi chú
- AI phân tích/phân loại ý kiến hiện là **mock** tại `src/services/aiService.ts` — khi có API thật chỉ cần thay phần gọi mạng, giữ nguyên interface.
- PWA: đã có `manifest.json` + `sw.js` (đăng ký khi build production).

## Deploy công khai (public)
- **Netlify Drop (nhanh nhất):** chạy `npm run build` → kéo thả thư mục `dist` vào https://app.netlify.com/drop → nhận link `.netlify.app`. File `public/_redirects` đã cấu hình sẵn cho SPA.
- **Vercel + GitHub (tự động):** đẩy code lên GitHub → import vào vercel.com → thêm biến môi trường `VITE_API_URL` (địa chỉ backend) → Deploy. File `vercel.json` đã cấu hình sẵn.
- Backend (Render): xem `render.yaml` — bắt buộc đặt `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` thật trước khi deploy (chi tiết ở mục "Bản vá bảo mật" bên dưới).
- Key AI (`GEMINI_API_KEY`) chỉ đặt trên backend, **không** đặt ở biến `VITE_*` của frontend — key ở frontend sẽ công khai cho mọi người xem được qua DevTools.

## Database (MySQL/MariaDB)
File `database/hop_thu_an_ninh_so.sql` chứa schema hoàn chỉnh: 9 bảng, trigger, function sinh mã tra cứu, procedure cập nhật trạng thái/tra cứu/chống spam, 3 view thống kê, kèm dữ liệu demo DEMO01–DEMO04. Import bằng phpMyAdmin/MySQL Workbench hoặc: `mysql -u root -p < database/hop_thu_an_ninh_so.sql`. Lưu ý: đổi password_hash tài khoản admin bằng bcrypt trước khi dùng thật. Web hiện vẫn chạy localStorage — database này dùng khi xây backend API.

## Bản vá bảo mật khẩn cấp — 2026-08-03 (nhánh `LOC`)

Hệ thống trước bản vá đang **phơi dữ liệu tố giác tội phạm ra Internet** (2 router quản trị không xác thực, JWT_SECRET hard-code công khai trong repo, IP giả mạo được nên mọi hạn mức chống spam và cảnh báo dò mật khẩu vô hiệu, tin "ẩn danh" thực chất dò ngược được danh tính). Chi tiết đầy đủ nằm ở `PROMPT-VA-BAO-MAT.md`. Dưới đây là tóm tắt những gì đã sửa.

**Nguyên tắc xuyên suốt**: khi phân vân giữa hai phương án, luôn chọn phương án bảo vệ người tố giác — kể cả khi đó là làm hệ thống **từ chối phục vụ** thay vì âm thầm hoạt động sai (fail-safe, không fail-open).

### Giai đoạn 0 — làm cho chạy được
- **B1**: `server/src/lib/ai.js` thiếu export `geminiAnalyze`/`geminiModerateImage` mà `routes/ai.js` lại import → ESM ném `SyntaxError`, backend chết ngay lúc khởi động. Đã viết bổ sung 2 hàm này (tái dùng `callOnce`/`callGemini` sẵn có); nội dung tố giác vẫn phân tích **nội bộ**, không gửi ra Google.
- **B2**: `src/App.tsx` import `./pages/admin/AdminQRPage` — file không tồn tại, `npm run build` chết ở bước `tsc`. Đã gỡ route/menu liên quan.

### Giai đoạn 1 — CRITICAL
- **C1**: `routes/admin/kiosk.js` và `routes/admin/trash.js` quên gắn `requireAuth` → đọc/ghi được toàn bộ thùng rác (gồm tin tố giác) và chèn tin "đã xác minh tại trụ sở" **không cần đăng nhập**. Chốt `requireAuth` ở tầng router cha `routes/admin/index.js` để không router con nào quên được nữa.
- **C2**: `JWT_SECRET` có giá trị mặc định hard-code trong mã nguồn công khai trên GitHub → ai đọc repo cũng tự ký được token admin. Bỏ hẳn giá trị mặc định, bắt buộc ≥ 32 ký tự, thiếu thì server từ chối khởi động. `render.yaml` bổ sung `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`, `TURNSTILE_SECRET_KEY`.
- **C3**: 8 nơi trong mã nghiệp vụ đọc IP từ header `X-Forwarded-For` do **client tự đặt** (giả mạo được bằng một dòng `curl -H`), vô hiệu mọi hạn mức chống spam và làm mù cảnh báo dò mật khẩu. Thêm `clientIp(req)` dùng `req.ip` (đã đi qua `trust proxy`), thay thế đủ 8 vị trí.
- **C4**: SĐT/email băm bằng SHA-256 trần (miền giá trị SĐT di động VN chỉ ~10⁸, dò ngược mất vài phút) → phá vỡ lớp mã hoá AES-256-GCM ngay bên cạnh. Thêm `hashIdentifier()` dùng HMAC với `HASH_PEPPER` (biến môi trường, không nằm trong DB). IP và User-Agent của người gửi ẩn danh không còn lưu dạng chữ trần. Bỏ `SELECT s.*` ở endpoint chi tiết — trước đây spread thẳng cả `ip_address`/`user_agent` vào response cho mọi cán bộ.

### Giai đoạn 2 — HIGH
- **H1**: `authorize('admin','manager')` cho `POST /:id/reveal` và toàn bộ `/reports/*` — trước đây mọi cán bộ `handler` đều xem được danh tính đầy đủ và xuất được 2000 dòng nội dung tin báo.
- **H2**: `/reveal` giờ chỉ cho `admin` hoặc cán bộ **được phân công đúng hồ sơ đó** — chống cán bộ tha hoá tra danh tính hồ sơ mình không phụ trách. Giao diện hiện lỗi 403 rõ ràng ngay dưới nút, không còn trắng màn hình.
- **H3**: gỡ nhánh gọi thẳng OpenAI/Gemini từ trình duyệt — key bị Vite inline thẳng vào bundle JS (ai mở DevTools cũng lấy được), và ảnh bằng chứng của dân bị gửi thẳng sang Google. Chỉ còn đường qua backend (`/api/ai/chat`, `/api/ai/moderate-image`).
- **H4**: kết nối MySQL với `DB_SSL=true` trước đây **không xác thực chứng chỉ** (`rejectUnauthorized: false`) → chống nghe lén thụ động nhưng không chống man-in-the-middle. Nay xác thực CA hệ thống, hỗ trợ thêm `DB_SSL_CA_PEM` để dán trực tiếp nội dung PEM (Render không có filesystem cố định để trỏ đường dẫn file).
- **H5**: access token của cán bộ chuyển từ `sessionStorage` (đọc được bằng một dòng JavaScript, dễ bị đánh cắp qua XSS) sang biến trong RAM; phiên đăng nhập khôi phục qua cookie refresh `httpOnly` khi tải lại trang. Xoá cặp `authService.ts` + `useAuth.tsx` — bản an toàn hơn nhưng không nơi nào dùng, còn bản kém an toàn (`adminService.ts`) mới là bản chạy thật.
- **H6**: `docs/adr/001-pham-vi-du-lieu-theo-don-vi.md` — ghi rõ hệ thống hiện giả định **một đơn vị/một database**; nếu gộp nhiều đơn vị dùng chung DB thì cần thêm `unit_id` và đây sẽ là IDOR ngang nghiêm trọng ngay lập tức.

### Kiểm chứng
- 187 test (`server/tests/`, chạy bằng `node --test`, không cần MySQL): `cd server && npm install && npm test`.
- Mỗi lỗ hổng có test hồi quy — đã tự kiểm chứng bằng cách revert từng phần bản vá và xác nhận test tương ứng chuyển đỏ.
- Có thêm bộ test khoá lại 10 quyết định bảo mật đúng đắn đã tồn tại từ trước (không khoá tài khoản khi sai mật khẩu, luôn chạy `bcrypt.compare` kể cả khi không tìm thấy user, cookie `secure` mặc định bật, v.v.) để không ai vô tình phá khi sửa code sau này.

### Việc người vận hành phải tự làm (agent không tự làm được)
1. Đặt `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` thật trên Render (`openssl rand -hex 32`).
2. `TRUNCATE TABLE refresh_tokens;` — huỷ mọi phiên cấp bằng secret cũ.
3. Đổi mật khẩu tài khoản `admin`: `node scripts-create-admin.js <mật_khẩu_mới>`.
4. Rà bảng `staff` xem có tài khoản lạ không (kẻ tấn công có thể đã tự tạo bằng token giả).
5. Nạp CA vào `DB_SSL_CA_PEM` **trước khi** deploy bản vá — nếu không, backend không kết nối được MySQL cloud.
6. Thu hồi key AI nếu từng đặt vào `VITE_OPENAI_API_KEY`/`VITE_GEMINI_API_KEY` trên bản deploy cũ.

### Còn tồn đọng — chưa sửa, ngoài phạm vi bảo mật
- **`npm run build` (frontend) hiện KHÔNG chạy được** — 10 lỗi TypeScript có sẵn từ trước bản vá (đã kiểm chứng bằng cách stash bản vá và chạy lại `tsc --noEmit` trên cây gốc). Đáng chú ý nhất: `src/components/common/VoiceInput.tsx` được import ở 2 nơi nhưng không tồn tại. Đây là lỗi tính năng, không phải lỗi bảo mật, nên không tự sửa.
- Stored procedure `check_spam` trong `database/hop_thu_an_ninh_so.sql` là code chết (backend không gọi, so sánh SĐT plaintext với cột đã mã hoá nên không bao giờ khớp) — chưa xoá.
