# Kiểm kê endpoint — P01 (KHAO-SAT)

Điền đủ các cột còn dấu `?` trong ba bảng ở [01-GIAI-DOAN-1-KIEM-KE.md](01-GIAI-DOAN-1-KIEM-KE.md) §1.1.
Đối chiếu cả ba biến thể khởi động backend (`index.js`, `may-chu-cong-khai.js`, `may-chu-can-bo.js`
+ `nen-tang.js`) — xem mục "Đối chiếu ba biến thể" ở cuối file.

Lệnh tái tạo danh sách bất cứ lúc nào:

```bash
grep -rnoE "router\.(get|post|put|patch|delete)\(" server/src/routes
```

> ⚠️ **File này công khai trên GitHub.** Đây là bảng **kiểm kê** — ghi lớp bảo vệ nào đang
> gắn ở đâu. Không phải bảng chấm lỗi, và không mô tả điểm yếu chưa vá. Các điểm cần soi kỹ
> phát hiện trong phiên này nằm ở `buglogs/` (nội bộ, đã gitignore), theo luật 10 trong
> [CLAUDE.md](../../CLAUDE.md).
>
> Cột "Cần xác minh ở GĐ2" giữ nguyên nội dung gốc — đó là việc của các phiên `RA-SOAT`
> (P03–P10), không phải việc của phiên kiểm kê này.

---

## A. Nhóm công khai — không cần đăng nhập

| # | Method | Đường dẫn | File | Rate limit hiện có | Cần xác minh ở GĐ2 |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | `server/src/index.js` | chung 300/15p | Rò rỉ thông tin phiên bản? |
| 2 | GET | `/api/health/schema` | `server/src/index.js` | chung 300/15p | Endpoint chẩn đoán — đánh giá mức lộ thông tin ở production |
| 3 | POST | `/api/otp/send` | `routes/otp.js` | 5 mã/giờ/email + cooldown 60s — kiểm ở tầng ứng dụng qua DB, không có middleware `express-rate-limit` | Bơm mail, dò email đã tồn tại |
| 4 | POST | `/api/otp/verify` | `routes/otp.js` | sai 5 lần huỷ mã (`MAX_ATTEMPTS`, đếm theo bản ghi OTP); không có middleware riêng | Brute-force mã 6 số |
| 5 | POST | `/api/otp/anon-code` | `routes/otp.js` | Không có middleware `rateLimit`. Kiểm ở tầng ứng dụng: 50 mã/ngày/IP + cooldown 10s (hạn mức nới rộng có chủ đích, lý do CGNAT ghi trong code) | Sinh mã ẩn danh hàng loạt · kiểm tính atomic của phép đếm |
| 6 | POST | `/api/otp/anon-verify` | `routes/otp.js` | Không có middleware `rateLimit` và không khoá theo IP. Giới hạn theo số lần thử sai của từng mã (`MAX_ATTEMPTS = 5`) | Brute-force mã ẩn danh |
| 7 | POST | `/api/submissions` | `routes/submissions.js` | Không có middleware riêng. Kiểm ở tầng ứng dụng: cooldown 2 phút (ẩn danh 10 phút), 5/giờ (ẩn danh 2/ngày), cộng chặn theo thiết bị/IP ở `lib/chan-spam.js` | Payload 32MB, upload, injection |
| 8 | GET | `/api/submissions/wards` | `routes/submissions.js` | chung 300/15p | — |
| 9 | GET | `/api/submissions/qr-points/:code` | `routes/submissions.js` | chung 300/15p | Dò mã QR |
| 10 | POST | `/api/submissions/kiem-tra-khoa` | `routes/submissions.js` | Không có middleware riêng — chỉ chung 300/15p | Lộ trạng thái shadow-ban cho kẻ spam |
| 11 | GET | `/api/tracking/:code` | `routes/tracking.js` | 30/phút, khoá theo `layIpThat(req)` — middleware `gioiHanTraCuu` | **Brute-force mã tra cứu 6 ký tự** |
| 12 | POST | `/api/tracking/:code/request-deletion` | `routes/tracking.js` | Không gắn `gioiHanTraCuu` — chỉ chung 300/15p. ⚠️ Khác với bảng gốc §1.1 (ghi "30/phút" cho cả hai dòng #11 và #12); đã kiểm lại trong code, xem ghi chú P01 ở `buglogs/` | Xoá dữ liệu của người khác — **cần đánh giá ở GĐ2** |
| 13 | POST | `/api/chat/open` | `routes/chat.js` | 5/15p — middleware `gioiHanMoPhong` | — |
| 14 | GET | `/api/chat/messages` | `routes/chat.js` | Không có middleware riêng — chỉ chung 300/15p. Vào bằng vé JWT (`chatToken`, purpose `chat_reporter`) | IDOR đọc hội thoại người khác |
| 15 | POST | `/api/chat/messages` | `routes/chat.js` | 20/5p — middleware `gioiHanGuiTin` | XSS lưu trữ (cán bộ là nạn nhân) |
| 16 | GET | `/api/news` | `routes/news.js` | chung 300/15p | — |
| 17 | POST | `/api/news/:id/xem` | `routes/news.js` | Không có middleware riêng — chỉ chung 300/15p | Bơm lượt xem |
| 18 | GET | `/api/ban-do` | `routes/ban-do.js` | 20/phút, khoá theo IP — middleware `gioiHan` | Lộ toạ độ chính xác vụ việc |
| 19 | GET | `/api/khieu-nai/trang-thai` | `routes/khieu-nai.js` | 5/10p — dùng chung middleware `gioiHan` với route POST cùng file | — |
| 20 | POST | `/api/khieu-nai` | `routes/khieu-nai.js` | 5/10p (`gioiHan`) + tối đa 2 lần/hồ sơ kiểm qua DB | Giới hạn 2 lần/hồ sơ — kiểm tính atomic |
| 21 | GET | `/api/tts` | `routes/tts.js` | 60/phút, khoá theo IP — middleware `gioiHan` | SSRF / lạm dụng quota |
| 22 | GET | `/api/ai/status` | `routes/ai.js` | 30/5p — `aiLimiter` gắn bằng `router.use` cho cả router | — |
| 23 | POST | `/api/ai/chat` | `routes/ai.js` | 30/5p (`aiLimiter`) | **Prompt injection, đốt quota key AI** |
| 24 | POST | `/api/ai/analyze` | `routes/ai.js` | 30/5p (`aiLimiter`) — xử lý nội bộ, không gọi AI ngoài | Như trên |
| 25 | POST | `/api/ai/moderate-image` | `routes/ai.js` | 30/5p (`aiLimiter`) — route đã vô hiệu hoá, luôn trả `blocked: false`, không gọi AI ngoài | Upload ảnh độc, đốt quota |

## B. Nhóm quản trị — dưới `/api/admin`, đi qua `requireAuth`

**Chốt xác thực tập trung:** `routes/admin/index.js` gọi `router.use(requireAuth)` **trước**
khi gắn bất kỳ router con nào, nên mọi đường dẫn dưới `/api/admin` đều phải đăng nhập, kể cả
router thêm mới sau này. Vài router con còn gắn thêm `requireAuth` lần nữa làm lớp thứ hai.

Cột dưới đây ghi lớp **phân quyền theo vai trò** có thêm hay không, ngoài `requireAuth`.

| # | Method | Đường dẫn | File | `authorize()` | Cần xác minh ở GĐ2 |
|---|---|---|---|---|---|
| 26 | GET | `/api/admin/dashboard/stats` | `admin/dashboard.js` | Không có — mọi vai trò đã đăng nhập | |
| 27 | GET | `/api/admin/submissions` | `admin/submissions.js` | Không có — mọi vai trò | Lọc/sắp xếp → SQL injection qua `ORDER BY`. **Đã có allow-list**: `CACH_SAP_XEP` cố định, tra bằng `Object.hasOwn` (chặn cả đường vòng qua prototype). GĐ2 xác minh lại |
| 28 | GET | `/api/admin/submissions/:id` | `admin/submissions.js` | Không có — mọi vai trò. Không kiểm `assigned_to`. Tên/SĐT trả về đã che qua `maskName`/`maskPhone` | IDOR giữa các cán bộ |
| 29 | POST | `/api/admin/submissions/:id/reveal` | `admin/submissions.js` | `authorize('admin','manager')` **+** kiểm `assigned_to === req.staff.id` (trừ `admin`) **+** ghi `staff_activity_logs` trước khi trả dữ liệu | **Điểm nóng nhất hệ thống** — ba lớp đã có, GĐ2 kiểm còn đường nào khác giải mã được không |
| 30 | PATCH | `/api/admin/submissions/:id/status` | `admin/submissions.js` | Không có — mọi vai trò. Không kiểm `assigned_to` | Cán bộ đổi trạng thái hồ sơ không phụ trách |
| 31 | PATCH | `/api/admin/submissions/:id/assign` | `admin/submissions.js` | `authorize('admin','manager')` | **Tự phân công cho mình rồi gọi `/reveal`** — chuỗi này cần thử ở GĐ2 |
| 32 | PATCH | `/api/admin/submissions/:id/security-level` | `admin/submissions.js` | `authorize('admin','manager')` | Hạ mức mật để xem được |
| 33 | POST | `/api/admin/submissions/:id/review` | `admin/submissions.js` | Không có — mọi vai trò | |
| 34 | POST | `/api/admin/submissions/:id/mark-spam` | `admin/submissions.js` | Không có — mọi vai trò | Chôn tin báo thật |
| 35 | GET | `/api/admin/logs` | `admin/logs.js` | `authorize('admin','manager')` — `router.use` áp cho cả file | Cán bộ thường có đọc được nhật ký không → **không** |
| 36 | GET | `/api/admin/logs/canh-bao` | `admin/logs.js` | `authorize('admin','manager')` — kế thừa `router.use` cùng file | |
| 37 | GET | `/api/admin/staff` | `admin/staff.js` | Không có — mọi vai trò | Lộ danh sách cán bộ — **cần đánh giá ở GĐ2** |
| 38 | GET/POST/DELETE | `/api/admin/banned-words`, `/:id` | `admin/banned-words.js` | `authorize('admin','manager')` — `router.use` áp cho cả file | Gỡ từ cấm để lọt nội dung xấu |
| 39 | GET/POST/PATCH/DELETE | `/api/admin/qr-points`, `/:id` | `admin/qr-points.js` | `GET /` không có (mọi vai trò xem/in — chủ đích, có comment trong code); `POST`/`PATCH`/`DELETE` đều `authorize('admin','manager')` | |
| 40 | POST | `/api/admin/kiosk/submit` | `admin/kiosk.js` | Không có — mọi vai trò | Ghi tin "đã xác minh tại trụ sở" — **cần đánh giá ở GĐ2** |
| 41 | GET/POST/DELETE | `/api/admin/trash`, `/:id/restore`, `/:id`, `/` | `admin/trash.js` | `GET /`, `POST /:id/restore`: không có (mọi vai trò). `DELETE /:id`, `DELETE /`: kiểm `req.staff.role !== 'admin'` **thủ công trong handler** — không dùng middleware `authorize()` nhưng hiệu lực tương đương | **`DELETE /` xoá sạch thùng rác — ai gọi được?** → chỉ `admin` |
| 42 | GET/POST/DELETE | `/api/admin/chat/*` | `admin/chat.js` | Không có: `GET/POST /:id/messages`, `GET /blacklist`, `GET /khieu-nai` (mở cho mọi vai trò — chủ đích, có comment giải thích). `authorize('admin','manager')`: `DELETE /blacklist/:id`, `GET/POST/DELETE /trusted-devices`, `POST /khieu-nai/:id/xu-ly` | |
| 43 | GET/POST | `/api/admin/incident-groups`, `/:id`, `/:id/ack` | `admin/incident-groups.js` | Không có — mọi vai trò | |
| 44 | GET | `/api/admin/reports/{map,summary,details}` | `admin/reports.js` | `GET /map`: không có — khai **trước** dòng `router.use(authorize('admin','manager'))` nên mọi vai trò gọi được (chủ đích, có comment: chỉ trả số lượng theo địa bàn). `GET /summary`, `GET /details`: `authorize('admin','manager')`, có `ghiNhatKy` khi xuất | Xuất hàng loạt dữ liệu nhạy cảm (`LIMIT 2000`) |

## C. Nhóm xác thực

| # | Method | Đường dẫn | File | Ghi chú cần xác minh |
|---|---|---|---|---|
| 45 | POST | `/api/auth/login` | `routes/auth.js` | 5 lần/15 phút **theo IP** — `loginLimiter` dùng key mặc định của `express-rate-limit` (`req.ip`, đã có `trust proxy: 1`), **không** theo username. Có thêm lớp theo tài khoản: sai ≥3 lần (đếm ở `staff.failed_attempts`) thì bắt qua Turnstile CAPTCHA. Cố ý **không khoá tài khoản** — lý do ghi rõ trong code: khoá được thì kẻ xấu gõ sai liên tục là đẩy được cán bộ thật ra ngoài |
| 46 | POST | `/api/auth/refresh` | `routes/auth.js` | Cookie `refreshToken` đặt `httpOnly`, `secure` (tắt khi `CLIENT_URL` là localhost), `sameSite: lax`, `path: /api/auth`, hạn 30 ngày. **Không rotate** — endpoint chỉ cấp `accessToken` mới, refresh token giữ nguyên tới khi hết hạn hoặc logout |
| 47 | POST | `/api/auth/logout` | `routes/auth.js` | **Thu hồi thật phía server** — `UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?` rồi mới `clearCookie`, không chỉ xoá cookie phía client |
| 48 | GET | `/api/auth/me` | `routes/auth.js` | Bảo vệ bởi `requireAuth` |

---

## Đối chiếu ba biến thể khởi động backend (ND-010)

Đã đọc `index.js`, `nen-tang.js`, `may-chu-cong-khai.js`, `may-chu-can-bo.js`.

**Không phát hiện lệch cấu hình bảo mật giữa ba biến thể** — nhưng vì lý do cấu trúc, không
phải vì đã thử hết mọi trường hợp:

- Rate limit **theo từng route** (`gioiHanTraCuu`, `aiLimiter`, `loginLimiter`, …) khai ngay
  trong file route. Cả ba biến thể `import` cùng những file đó → không có chỗ để lệch.
- `authorize()` cho `/api/admin/*` nằm trong `adminRouter` (`routes/admin/index.js`). Cả
  `index.js` (gộp) và `may-chu-can-bo.js` đều `import` cùng router này → giống nhau.
  `may-chu-cong-khai.js` không gắn `adminRouter` — đúng thiết kế, không phải thiếu sót.
- `may-chu-can-bo.js` có thêm lớp `chanTheoIp` đặt trước cả `requireAuth`. Chỉ biến thể tách
  riêng mới có — khác biệt **cố ý**, ghi rõ trong comment đầu file.

**Điểm cần chú ý cho các phiên sau:** middleware toàn cục (Helmet, CORS, rate limit chung
300/15p, `trust proxy`) tồn tại ở **hai bản chép song song** — `index.js` tự viết tay, còn hai
máy chủ tách riêng gọi `taoApp()` trong `nen-tang.js`. Hiện nội dung hai bản giống nhau, nhưng
đây đúng là hình dạng rủi ro mà ND-010 mô tả: sửa một bên rất dễ quên bên kia. Hai bản cũng đã
lệch một chi tiết không thuộc bảo mật — `BACKEND_VERSION` (`v8-2026-07` ở `index.js`,
`v9-2026-08` ở `nen-tang.js`).

**Chưa làm:** chưa chạy thử cả ba biến thể để xác nhận bằng thực nghiệm — toàn bộ mục này là
đọc code tĩnh. GĐ2 nên gọi cùng một request tới `index.js` và `may-chu-can-bo.js` rồi đối chiếu.

## Điểm nghi ngờ chuyển sang GĐ2

Phiên này ghi được 3 điểm cần soi kỹ. Vì chúng mô tả chỗ **chưa vá**, chi tiết nằm ở
`buglogs/ghi-chu-P01-diem-nghi.md` (nội bộ, đã gitignore) — luật 10.

| # | Vùng | Chuyển cho |
|---|---|---|
| 1 | Giới hạn tần suất, `routes/tracking.js` | P04 hoặc P05 |
| 2 | Tính atomic của phép đếm hạn mức, `routes/otp.js` | P08 (gộp với dòng `khieu-nai` đã có ở §2.2) |
| 3 | Phân quyền theo vai trò dưới `/api/admin` | **P04** (nhóm 2 — ưu tiên cao nhất) |

Cả ba đều là **quan sát từ đọc code tĩnh**, chưa chạy thử, chưa chấm mức độ. Phiên `KHAO-SAT`
không có thẩm quyền kết luận là lỗ hổng — phiên `RA-SOAT` xác nhận thì mới mở `BUG-xxx`.
