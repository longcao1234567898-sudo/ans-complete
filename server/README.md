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
| POST | `/api/submissions` | Gửi ý kiến (chống spam server) |
| POST | `/api/ai/chat` \| `/analyze` \| `/moderate-image` | AI proxy |

### Xác thực cán bộ
| Method | Path | Chức năng |
|--------|------|-----------|
| POST | `/api/auth/login` | Đăng nhập (rate limit 5 lần/15ph) |
| POST | `/api/auth/refresh` | Làm mới access token |
| POST | `/api/auth/logout` | Đăng xuất, thu hồi token |
| GET  | `/api/auth/me` | Thông tin bản thân |

### Quản trị (cần đăng nhập)
| Method | Path | Quyền |
|--------|------|-------|
| GET   | `/api/admin/dashboard/stats` | mọi cán bộ |
| GET   | `/api/admin/submissions` | mọi cán bộ (lọc, phân trang, tìm kiếm) |
| GET   | `/api/admin/submissions/:id` | mọi cán bộ (chi tiết + ảnh + timeline) |
| PATCH | `/api/admin/submissions/:id/status` | mọi cán bộ |
| PATCH | `/api/admin/submissions/:id/assign` | admin, manager |
| GET/POST/DELETE | `/api/admin/banned-words` | admin, manager |

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
