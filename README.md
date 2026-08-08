# Hộp Thư An Ninh Số

Nền tảng tiếp nhận, phân loại và xử lý ý kiến/tố giác công dân bằng AI, dành cho Công an xã/phường (bản demo hiện cấu hình cho Công an thị xã Tân Châu, tỉnh An Giang — xem mục [Tuỳ biến cho đơn vị](#tuỳ-biến-cho-đơn-vị)).

Gồm 2 phần độc lập, có thể chạy riêng:
- **Frontend** (thư mục gốc): React SPA — chạy được **một mình** ở chế độ offline (lưu localStorage), không bắt buộc phải có backend.
- **Backend** (`server/`): Node/Express/MySQL — bật khi cần dữ liệu thật, xác thực cán bộ, và giấu key AI khỏi trình duyệt. Xem [server/README.md](server/README.md) để biết chi tiết API.

## Trạng thái hiện tại (2026-08-08)
- ✅ `npm run build` (frontend) chạy sạch, không lỗi TypeScript.
- ✅ Backend: 285/285 test pass (`cd server && npm test`).
- ⚠️ Xem mục [Việc còn tồn đọng](#việc-còn-tồn-đọng--hướng-phát-triển-tiếp-theo) trước khi bàn giao hoặc mở rộng — có vài chỗ tài liệu/cấu hình chưa theo kịp code.

## Kiến trúc & thư mục chính
```
ans-complete/
├─ src/                  Frontend (React + TS)
│  ├─ pages/              Trang công khai (Home, Gửi ý kiến, Tra cứu, Tin tức...)
│  ├─ pages/admin/         Trang quản trị (Dashboard, Bản đồ, Thùng rác, QR, Nhật ký...)
│  ├─ components/          UI theo tính năng (AIChat, FeedbackForm, Tracking, admin...)
│  ├─ services/            Gọi API / logic nghiệp vụ phía client (adminService, aiService, uploadService...)
│  └─ utils/               constants, security.ts (lá chắn nội dung), mockData.ts
├─ server/                Backend (Node + Express + MySQL), xem server/README.md
├─ database/              Schema + migration SQL (xem mục Database bên dưới)
├─ docs/adr/               Quyết định kiến trúc (Architecture Decision Records)
└─ docs/CHANGELOG-BAO-MAT.md   Nhật ký đợt vá bảo mật lớn 2026-08-03
```

## Công nghệ
**Frontend**: React 18 + TypeScript + Vite · Tailwind CSS · Framer Motion · TanStack React Query · React Router · react-leaflet/Leaflet (bản đồ) · recharts (biểu đồ) · xlsx (xuất báo cáo) · html5-qrcode + qrcode.react (QR) · react-markdown · react-hot-toast

**Backend**: Express · MySQL (mysql2) · JWT (jsonwebtoken) · bcryptjs · helmet · express-rate-limit · nodemailer/Resend/Brevo (email OTP) · otplib · qrcode

## Chạy dự án (dev)

### 1. Frontend
```bash
npm install          # cần Node.js >= 18
npm run dev           # http://localhost:3000
npm run build          # kiểm tra production build
npm run preview
```
Không cần backend để chạy — mặc định hoạt động offline với dữ liệu mẫu (`src/utils/mockData.ts`) và lưu vào `localStorage`.

### 2. Backend (tuỳ chọn, cần cho dữ liệu thật)
```bash
cd server
npm install
cp .env.example .env    # rồi điền JWT_SECRET/ENCRYPTION_KEY/HASH_PEPPER (bắt buộc), xem server/README.md
npm run dev              # http://localhost:4000
```
Yêu cầu MySQL đang chạy + đã import database (xem mục dưới). Sau khi có backend, đặt `VITE_API_URL=http://localhost:4000` ở `.env` của frontend để 2 phần nói chuyện được với nhau.

### 3. Database (MySQL/MariaDB)
Import theo đúng thứ tự:
```bash
mysql -u root -p hop_thu_an_ninh_so < database/TRON_BO_DATABASE_V5.sql   # 1. Nền: schema gốc + nâng cấp V2–V5 + tin tức mẫu
mysql -u root -p hop_thu_an_ninh_so < database/nang_cap_v6.sql            # 2. Mức độ khẩn cấp
mysql -u root -p hop_thu_an_ninh_so < database/nang_cap_v7.sql            #    Thùng rác (xoá mềm 7 ngày)
mysql -u root -p hop_thu_an_ninh_so < database/nang_cap_v8.sql            #    Quyền xoá dữ liệu cá nhân (NĐ 13/2023/NĐ-CP)
mysql -u root -p hop_thu_an_ninh_so < database/nang_cap_v9.sql            #    Tăng cường bảo mật đăng nhập cán bộ
mysql -u root -p hop_thu_an_ninh_so < database/nang_cap_v10.sql           #    Mã QR định vị hiện trường
mysql -u root -p hop_thu_an_ninh_so < database/nang_cap_v11.sql           # 3. Gộp sự kiện trùng lặp (nhiều người báo 1 vụ)
```
`gan_anh_cho_tin_tuc.sql`, `nap_lai_tin_tuc.sql`, `sua_loi_anh.sql`, `tin_tuc_moi_thang_7_2026.sql` là dữ liệu tin tức mẫu/bản vá dữ liệu — tuỳ chọn, không phải schema.

File cũ `hop_thu_an_ninh_so.sql` (bản gốc, trước khi có V2–V11) vẫn còn trong repo để tham khảo lịch sử — **không dùng để cài đặt mới**, dùng `TRON_BO_DATABASE_V5.sql` ở trên.

Sau khi import, tạo mật khẩu admin:
```bash
cd server && node scripts-create-admin.js MatKhauCuaBan@2026
```

## Tính năng

### Công khai (người dân)
- Gửi ý kiến/tố giác — ẩn danh hoặc có danh tính, xác thực bằng **OTP gửi qua email** trước khi backend nhận (`/api/otp`), kèm mức độ khẩn cấp (bình thường/quan trọng/khẩn cấp).
- Lá chắn nội dung 2 lớp phía trình duyệt (`src/utils/security.ts`) + kiểm tra lại phía server.
- Trợ lý AI hỏi đáp (chatbot) — chạy qua backend proxy nếu có, fallback về câu trả lời mẫu nếu không.
- Tra cứu tiến độ bằng mã 6 ký tự.
- Tin tức đơn vị.
- CAPTCHA Cloudflare Turnstile chống bot (tuỳ chọn, bật khi có `TURNSTILE_SECRET_KEY`).
- Ảnh bằng chứng: kiểm duyệt AI + tái mã hoá qua canvas, tải lên Cloudinary nếu đã cấu hình (`VITE_CLOUDINARY_CLOUD_NAME`/`VITE_CLOUDINARY_PRESET`), fallback lưu base64 nếu chưa.
- PWA: `manifest.json` + `sw.js`.

### Quản trị (cán bộ, cần đăng nhập — mọi route dưới `/api/admin` đều qua `requireAuth`)
- Dashboard thống kê.
- Danh sách/chi tiết ý kiến: lọc, tìm kiếm, phân trang, đổi trạng thái, phân công cán bộ, xem danh tính (`/reveal`, giới hạn quyền).
- Duyệt tin (review).
- Bản đồ vụ việc (Leaflet).
- Gộp sự kiện trùng lặp — nhiều người cùng báo một vụ việc.
- Quản lý mã QR định vị (dán tại hiện trường/quầy tiếp dân).
- Chế độ Kiosk — cán bộ nhập tin "đã xác minh tại trụ sở" thay người dân.
- Thùng rác — xoá mềm, giữ 7 ngày, khôi phục được.
- Nhật ký hoạt động cán bộ + cảnh báo bất thường.
- Quản lý cán bộ, quản lý từ cấm (banned words).
- Báo cáo/thống kê, xuất Excel (xlsx).

## Biến môi trường

**Frontend** (`.env`, xem `.env.example`):
| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `VITE_API_URL` | Không | Trống = chạy offline (localStorage) |
| `VITE_CLOUDINARY_CLOUD_NAME` / `VITE_CLOUDINARY_PRESET` | Không | Bật upload ảnh lên Cloudinary (xem `src/services/uploadService.ts`) |

**Backend** (`server/.env`, xem `server/.env.example` và [server/README.md](server/README.md)) — chi tiết đầy đủ ở đó. Ba khoá `JWT_SECRET`/`ENCRYPTION_KEY`/`HASH_PEPPER` là bắt buộc, thiếu là server từ chối khởi động (cố ý, fail-safe).

⚠️ Không bao giờ đặt key AI (`GEMINI_API_KEY`) hay bất kỳ secret nào vào biến `VITE_*` — Vite inline thẳng vào bundle JS, ai mở DevTools cũng đọc được.

## Bảo mật
Dự án từng trải qua một đợt vá bảo mật khẩn cấp lớn (2026-08-03) — chi tiết đầy đủ (lỗ hổng, cách vá, cách kiểm chứng) ở [docs/CHANGELOG-BAO-MAT.md](docs/CHANGELOG-BAO-MAT.md). Tóm tắt các nguyên tắc còn áp dụng:
- **Fail-safe, không fail-open**: thiếu khoá bí mật → server từ chối khởi động, không âm thầm chạy với giá trị mặc định yếu.
- IP người dùng chỉ tin từ `req.ip` (đã qua `trust proxy`), không bao giờ tin header client tự đặt.
- SĐT/email băm bằng HMAC + pepper (biến môi trường, không nằm trong DB) — không phải SHA-256 trần.
- Danh tính người tố giác chỉ `admin` hoặc cán bộ **được phân công đúng hồ sơ đó** mới xem được, mọi lượt xem đều ghi log.
- Access token cán bộ giữ trong RAM (không `localStorage`/`sessionStorage`); phiên khôi phục qua cookie refresh `httpOnly`.
- Hệ thống giả định **một đơn vị/một database** — xem [docs/adr/001-pham-vi-du-lieu-theo-don-vi.md](docs/adr/001-pham-vi-du-lieu-theo-don-vi.md) trước khi gộp nhiều xã/phường dùng chung một database.
- Kiểm chứng: `cd server && npm test` (285 test, không cần MySQL).

## Tuỳ biến cho đơn vị
Sửa thông tin xã/phường (tên, địa chỉ, hotline, email) tại `src/utils/constants.ts` (hằng số `UNIT`) và `server/src/lib/unit.js` (dùng trong email OTP).

## Deploy công khai
- **Netlify Drop (nhanh nhất):** `npm run build` → kéo thả `dist` vào https://app.netlify.com/drop. `public/_redirects` đã cấu hình sẵn cho SPA.
- **Vercel + GitHub (tự động):** đẩy code lên GitHub → import vào vercel.com → thêm `VITE_API_URL` (+ `VITE_CLOUDINARY_*` nếu dùng) → Deploy. `vercel.json` đã cấu hình security headers — **phải giữ khớp** với `public/_headers` (bản Netlify), Vercel không đọc file `_headers`.
- **Backend (Render):** xem `render.yaml` — bắt buộc đặt `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`, `TURNSTILE_SECRET_KEY`, `BREVO_API_KEY`/`MAIL_USER` thật trước khi deploy.
- Key AI, key mail, Turnstile secret chỉ đặt trên backend/Render — không đặt ở biến `VITE_*` của frontend.

## Việc còn tồn đọng / hướng phát triển tiếp theo
- **Đa đơn vị (`unit_id`)**: quyết định sớm nếu định mở rộng nhiều xã/phường dùng chung database — xem ADR 001, thêm sau khi đã có dữ liệu thật sẽ tốn kém hơn nhiều.
- Stored procedure `check_spam` trong `database/hop_thu_an_ninh_so.sql` (bản cũ) là code chết — backend không gọi tới, và so sánh SĐT dạng chữ thường với cột đã mã hoá nên không bao giờ khớp. Chưa dọn.
- `database/` có nhiều file migration rời rạc (`nang_cap_v6`…`v11`) — cân nhắc gộp vào một file "trọn bộ" mới (như `TRON_BO_DATABASE_V5.sql` đã làm cho V2–V5) khi ổn định, để người cài mới không phải chạy 7 lệnh liên tiếp.
- Chưa có test tự động cho frontend (chỉ có kiểm tra kiểu TypeScript qua `tsc`) — nếu tính năng quan trọng thêm vào, cân nhắc thêm Vitest/Playwright.

## Mã tra cứu demo
| Mã     | Trạng thái     |
|--------|----------------|
| DEMO01 | Đã tiếp nhận   |
| DEMO02 | Đang xử lý     |
| DEMO03 | Đã giải quyết  |
| DEMO04 | Từ chối        |

Ý kiến gửi mới ở chế độ offline được lưu vào `localStorage` và tra cứu được bằng mã 6 ký tự do hệ thống cấp.
