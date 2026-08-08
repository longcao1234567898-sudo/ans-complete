# Backend — Hộp Thư An Ninh Số (bản bảo mật cao)

Node.js + Express + MySQL. Giấu key AI phía server, xác thực JWT cho cán bộ.

## Chạy local
```bash
cd server
npm install
# .env đã điền sẵn key Gemini + cấu hình XAMPP mặc định
npm run dev        # http://localhost:4000
```
Yêu cầu: MySQL đang chạy + đã import `../database/hop_thu_an_ninh_so.sql`.

## Tạo mật khẩu admin (chạy 1 lần sau khi import DB)
```bash
node scripts-create-admin.js MatKhauCuaBan@2026
```
Sau đó đăng nhập: username `admin`, password vừa đặt.

## Endpoint

### Công khai
| Method | Path | Chức năng |
|--------|------|-----------|
| GET  | `/api/health` | Kiểm tra server + AI |
| GET  | `/api/tracking/:code` | Tra cứu tiến độ |
| GET  | `/api/news?tag=&limit=` | Tin tức |
| POST | `/api/otp/send` | Gửi mã OTP 6 số về email (bcrypt hash, TTL 10 phút, tối đa 5 mã/giờ) |
| POST | `/api/otp/verify` | Xác nhận OTP, cấp `otpToken` (JWT ngắn hạn) |
| POST | `/api/submissions` | Gửi ý kiến — cần `otpToken` hợp lệ, chống spam server |
| GET  | `/api/admin/qr-points` | Danh sách điểm QR định vị (đọc công khai để quét tại hiện trường) |
| POST | `/api/ai/chat` \| `/analyze` \| `/moderate-image` | AI proxy (giấu key Gemini) |

### Xác thực cán bộ
| Method | Path | Chức năng |
|--------|------|-----------|
| POST | `/api/auth/login` | Đăng nhập (rate limit 5 lần/15ph) |
| POST | `/api/auth/refresh` | Làm mới access token |
| POST | `/api/auth/logout` | Đăng xuất, thu hồi token |
| GET  | `/api/auth/me` | Thông tin bản thân |

### Quản trị (mọi route dưới `/api/admin` đều qua `requireAuth` — chốt tại `routes/admin/index.js`, không router con nào tự bỏ qua được)
| Method | Path | Quyền | Chức năng |
|--------|------|-------|-----------|
| GET | `/api/admin/dashboard/stats` | mọi cán bộ | Thống kê tổng quan |
| GET | `/api/admin/submissions` | mọi cán bộ | Danh sách (lọc, phân trang, tìm kiếm) |
| GET | `/api/admin/submissions/:id` | mọi cán bộ | Chi tiết + ảnh + timeline |
| POST | `/api/admin/submissions/:id/reveal` | admin, hoặc cán bộ được phân công hồ sơ đó | Xem danh tính người gửi (ghi audit log) |
| PATCH | `/api/admin/submissions/:id/status` | mọi cán bộ | Đổi trạng thái |
| PATCH | `/api/admin/submissions/:id/assign` | admin, manager | Phân công cán bộ |
| POST | `/api/admin/submissions/:id/review` | mọi cán bộ | Duyệt tin |
| GET/POST/DELETE | `/api/admin/banned-words` | mọi cán bộ (đọc), — | Quản lý từ cấm |
| GET | `/api/admin/staff` | mọi cán bộ | Danh sách cán bộ |
| GET | `/api/admin/reports/summary` \| `/map` \| `/details` | mọi cán bộ | Báo cáo, xuất dữ liệu |
| GET | `/api/admin/logs` \| `/logs/canh-bao` | mọi cán bộ | Nhật ký hoạt động + cảnh báo bất thường |
| POST | `/api/admin/kiosk/submit` | mọi cán bộ | Nhập tin thay dân tại quầy tiếp dân (đánh dấu "đã xác minh tại trụ sở") |
| GET | `/api/admin/trash` | mọi cán bộ | Danh sách tin đã xoá mềm |
| POST | `/api/admin/trash/:id/restore` | mọi cán bộ | Khôi phục |
| DELETE | `/api/admin/trash/:id` \| `/api/admin/trash` | mọi cán bộ | Xoá hẳn 1 tin / dọn sạch thùng rác |
| GET/POST/PATCH/DELETE | `/api/admin/qr-points` | admin, manager (ghi) | Quản lý điểm QR định vị hiện trường |
| GET | `/api/admin/incident-groups` \| `/:id` | mọi cán bộ | Nhóm sự kiện trùng lặp (nhiều người báo 1 vụ) |
| POST | `/api/admin/incident-groups/:id/ack` | mọi cán bộ | Xác nhận đã xem nhóm sự kiện |

## Email OTP, CAPTCHA, upload ảnh
- **OTP email** (`src/lib/mailer.js`): tự chọn 1 trong 3 cách theo biến môi trường đã đặt — Resend (`RESEND_API_KEY`+`MAIL_FROM`, khuyên dùng vì Render hay chặn cổng SMTP), Gmail SMTP (`MAIL_USER`+`MAIL_PASS`, app password), hoặc chế độ demo (chưa cấu hình gì — trả mã ra log/response để test). `BREVO_API_KEY` cũng được hỗ trợ, ưu tiên cao nhất nếu có.
- **CAPTCHA** (`src/lib/turnstile.js`): Cloudflare Turnstile, tuỳ chọn — bật khi có `TURNSTILE_SECRET_KEY`, chưa đặt thì bỏ qua kiểm tra.
- **Ảnh bằng chứng**: frontend tự tải lên Cloudinary trực tiếp từ trình duyệt (unsigned preset, xem `src/services/uploadService.ts` ở frontend) nếu đã cấu hình `VITE_CLOUDINARY_*`; backend chỉ nhận link ảnh hoặc base64 fallback, không tự upload hộ.

Toàn bộ biến môi trường trên (kể cả các biến tuỳ chọn) đã có mẫu đầy đủ trong `server/.env.example`.

## Lớp bảo mật
- **JWT**: access token 8h + refresh token 30 ngày (lưu hash trong DB, thu hồi được)
- **bcrypt** hash mật khẩu (cost 12), so sánh chống dò tài khoản qua timing
- **Chống brute-force**: đăng nhập tối đa 5 lần/15 phút/IP
- **helmet**: 15 HTTP security header
- **httpOnly cookie** cho refresh token (JavaScript không đọc được)
- **Phân quyền 3 vai trò**: admin / manager / handler
- **Audit log**: ghi mọi thao tác cán bộ vào staff_activity_logs
- **Lá chắn nội dung server-side**: quét mã độc, từ cấm, SĐT, chống spam
- **Key Gemini** nằm ở server, không lộ xuống trình duyệt
