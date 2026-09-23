# Kiểm kê endpoint — viết lại ở P09 (KHAO-SAT, GĐ1-a)

> ⚠️ **Thay thế hoàn toàn bản của P01.** P01 kiểm kê trên bản mã ở máy trong khi GitHub đã
> đi trước 19 commit (66 endpoint lúc đó, thực tế 78). Xem [KE-HOACH.md](../KE-HOACH.md)
> mục "Vì sao phải làm lại Giai đoạn 1". Bốn BUG đã mở và phương pháp của P01 vẫn giữ
> nguyên giá trị — chỉ bảng dữ liệu này phải làm lại.

Điền đủ ba bảng A/B/C tương ứng §1.1 của [../phuong-phap/1-kiem-ke.md](../phuong-phap/1-kiem-ke.md).
Đối chiếu cả ba biến thể khởi động backend (`index.js`, `may-chu-cong-khai.js`,
`may-chu-can-bo.js` + `nen-tang.js`) — xem mục "Đối chiếu ba biến thể" ở cuối file.

Lệnh tái tạo danh sách (đếm **được 78**, kiểm ngày 2026-09-23):

```bash
grep -rnoE "router\.(get|post|put|patch|delete)\(" server/src/routes | wc -l
```

> ⚠️ **Lệnh trên KHÔNG đếm đủ.** Nó chỉ quét `server/src/routes/`, trong khi
> `GET /api/health` và `GET /api/health/schema` được gắn trực tiếp bằng `app.get()`
> ở tầng khởi động (`index.js`, `nen-tang.js`) — nằm **ngoài** thư mục `routes/`.
> Tổng số endpoint URL thật là **78 + 2 = 80**. Phiên sau đừng chạy mỗi lệnh trên rồi
> kết luận "80 endpoint" — phải cộng tay hai endpoint health, hoặc lệnh sẽ tự nhận
> thiếu hai điểm chẩn đoán quan trọng nhất khi debug production.

> ⚠️ **File này công khai trên GitHub.** Đây là bảng **kiểm kê** — ghi lớp bảo vệ nào đang
> gắn ở đâu. Không phải bảng chấm lỗi, và không mô tả điểm yếu chưa vá. Các điểm cần soi kỹ
> chuyển sang GĐ2 (`RA-SOAT`) qua cột "Cần xác minh ở GĐ2", không kết luận lỗ hổng ở đây.

---

## A. Nhóm công khai — không cần đăng nhập (bề mặt tấn công lớn nhất)

| # | Method | Đường dẫn | File | Rate limit hiện có | Cần xác minh ở GĐ2 |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | `index.js:117` (bản riêng) **và** `nen-tang.js:110` (dùng chung cho `may-chu-cong-khai.js`/`may-chu-can-bo.js`) | chung 300/15p | Hai bản trả **body khác nhau**: `index.js` có thêm trường `features: [...]`, không có `may_chu`; bản `nen-tang.js` có `may_chu` (tên biến thể) nhưng không có `features`. `BACKEND_VERSION` cũng lệch — xem ND-012 |
| 2 | GET | `/api/health/schema` | `index.js:135` **CHỈ ở đây** | chung 300/15p | Không tồn tại ở `may-chu-cong-khai.js`/`may-chu-can-bo.js` (không định nghĩa trong `nen-tang.js`). Trả tên database thật, danh sách mọi database trên server, và hướng dẫn "mở HeidiSQL" — mức lộ thông tin ở production cần đánh giá |
| 3 | POST | `/api/otp/send` | `routes/otp.js:43` | 5 mã/giờ/email + cooldown 60s — kiểm ở tầng ứng dụng qua DB, không có middleware `express-rate-limit` | Bơm mail, dò email đã tồn tại |
| 4 | POST | `/api/otp/verify` | `routes/otp.js:115` | sai 5 lần huỷ mã (`MAX_ATTEMPTS`, đếm theo bản ghi OTP); không có middleware riêng | Brute-force mã 6 số |
| 5 | POST | `/api/otp/anon-code` | `routes/otp.js:229` | Không có middleware `rateLimit`. Kiểm ở tầng ứng dụng: 50 mã/ngày/IP + cooldown 10s | Sinh mã ẩn danh hàng loạt · kiểm tính atomic của phép đếm |
| 6 | POST | `/api/otp/anon-verify` | `routes/otp.js:334` | Không có middleware `rateLimit` và không khoá theo IP. Giới hạn theo số lần thử sai của từng mã (`MAX_ATTEMPTS = 5`) | Brute-force mã ẩn danh |
| 7 | POST | `/api/submissions` | `routes/submissions.js:82` | Không có middleware riêng. Kiểm ở tầng ứng dụng: cooldown 2 phút (ẩn danh 10 phút), 5/giờ (ẩn danh 2/ngày), cộng chặn theo thiết bị/IP ở `lib/chan-spam.js` | Payload 32MB, upload ảnh + **tài liệu PDF/Word mới** (`lib/tai-lieu-an-toan.js`), injection |
| 8 | GET | `/api/submissions/wards` | `routes/submissions.js:51` | chung 300/15p | — |
| 9 | GET | `/api/submissions/qr-points/:code` | `routes/submissions.js:65` | chung 300/15p | Dò mã QR |
| 10 | POST | `/api/submissions/kiem-tra-khoa` | `routes/submissions.js:550` | Không có middleware riêng — chỉ chung 300/15p | Lộ trạng thái shadow-ban cho kẻ spam |
| 11 | GET | `/api/tracking/:code` | `routes/tracking.js:31` | 30/phút, khoá theo `layIpThat(req)` — middleware `gioiHanTraCuu` | **Brute-force mã tra cứu 6 ký tự** |
| 12 | POST | `/api/tracking/:code/request-deletion` | `routes/tracking.js:143` | Không gắn `gioiHanTraCuu` — chỉ chung 300/15p | Xoá dữ liệu của người khác |
| 13 | POST | `/api/chat/open` | `routes/chat.js:100` | 5/15p — middleware `gioiHanMoPhong` | — |
| 14 | GET | `/api/chat/messages` | `routes/chat.js:166` | Không có middleware riêng — chỉ chung 300/15p. Vào bằng vé JWT (`chatToken`, purpose `chat_reporter`) | IDOR đọc hội thoại người khác |
| 15 | POST | `/api/chat/messages` | `routes/chat.js:208` | 20/5p — middleware `gioiHanGuiTin` | XSS lưu trữ (cán bộ là nạn nhân) |
| 16 | GET | `/api/news` | `routes/news.js:10` | chung 300/15p | — |
| 17 | POST | `/api/news/:id/xem` | `routes/news.js:86` | Không có middleware riêng — chỉ chung 300/15p | Bơm lượt xem |
| 18 | GET | `/api/ban-do` | `routes/ban-do.js:44` | 20/phút, khoá theo IP — middleware `gioiHan` | Lộ toạ độ chính xác vụ việc |
| 19 | GET | `/api/khieu-nai/trang-thai` | `routes/khieu-nai.js:46` | 5/10p (`gioiHan`, `windowMs=10*60_000, max=5`) — dùng chung bộ đếm với route POST cùng file | — |
| 20 | POST | `/api/khieu-nai` | `routes/khieu-nai.js:98` | 5/10p (`gioiHan`) + tối đa 2 lần/hồ sơ kiểm qua DB | Giới hạn 2 lần/hồ sơ — kiểm tính atomic (`SELECT COUNT` rồi `INSERT`, hai câu rời) |
| 21 | GET | `/api/tts` | `routes/tts.js:56` | 60/phút, khoá theo IP — middleware `gioiHan` | SSRF / lạm dụng quota |
| 22 | GET | `/api/ai/status` | `routes/ai.js:15` | 30/5p — `aiLimiter` gắn bằng `router.use` cho cả router | — |
| 23 | POST | `/api/ai/chat` | `routes/ai.js:17` | 30/5p (`aiLimiter`) | **Prompt injection, đốt quota key AI** |
| 24 | POST | `/api/ai/analyze` | `routes/ai.js:30` | 30/5p (`aiLimiter`) — xử lý nội bộ, không gọi AI ngoài | Như trên |
| 25 | POST | `/api/ai/moderate-image` | `routes/ai.js:45` | 30/5p (`aiLimiter`) — route đã vô hiệu hoá, luôn trả `blocked: false`, không gọi AI ngoài | Upload ảnh độc, đốt quota |
| 26 | GET | `/api/diem-den` | `routes/diem-den.js:22` | **Không có middleware riêng — chỉ chung 300/15p** | Điểm đen giao thông, cố ý **không che số** (khác bản đồ ý kiến) — kiểm không có gì khác lộ qua `mo_ta`/`khuyen_cao` |
| 27 | POST | `/api/thong-ke/ghi-nhan` | `routes/thong-ke.js:52` | 30/phút, khoá theo IP — middleware `gioiHan`, vượt hạn mức **im lặng trả `ok:true`** (cố ý, không báo lỗi) | Đếm lượt: kiểm bơm số ảo có ảnh hưởng số liệu công khai không |
| 28 | GET | `/api/thong-ke` | `routes/thong-ke.js:74` | Không có middleware riêng — có cache RAM 60s (`HAN_CACHE_MS`) | — |

## B. Nhóm quản trị — dưới `/api/admin`, đi qua `requireAuth`

**Chốt xác thực tập trung:** `routes/admin/index.js:40` gọi `router.use(requireAuth)`
**trước** khi gắn bất kỳ router con nào — mọi đường dẫn dưới `/api/admin` đều phải đăng
nhập, kể cả router thêm mới sau này (đúng như chú thích đầu file mô tả sự cố cũ với
`trash.js`/`kiosk.js` quên gọi `requireAuth`).

Cột dưới đây ghi lớp **phân quyền theo vai trò** có thêm hay không, ngoài `requireAuth`.

| # | Method | Đường dẫn | File | `authorize()` | Cần xác minh ở GĐ2 |
|---|---|---|---|---|---|
| 29 | GET | `/api/admin/dashboard/stats` | `admin/dashboard.js:11` | Không có — mọi vai trò đã đăng nhập | |
| 30 | GET | `/api/admin/submissions` | `admin/submissions.js:63` | Không có — mọi vai trò | Lọc/sắp xếp → SQL injection qua `ORDER BY`. **Đã có allow-list** `CACH_SAP_XEP`, tra bằng `Object.hasOwn` (chặn đường vòng qua prototype, có chú thích giải thích vì sao không được tra thẳng). GĐ2 xác minh lại |
| 31 | GET | `/api/admin/submissions/:id` | `admin/submissions.js:277` | Không có — mọi vai trò. Không kiểm `assigned_to`. Tên/SĐT trả về đã che qua `maskName`/`maskPhone` | IDOR giữa các cán bộ |
| 32 | POST | `/api/admin/submissions/:id/reveal` | `admin/submissions.js:361` | `authorize('admin','manager')` **+** kiểm `assigned_to === req.staff.id` (trừ `admin`) **+** ghi `staff_activity_logs` trước khi trả dữ liệu | **Điểm nóng nhất hệ thống** — ba lớp đã có, GĐ2 kiểm còn đường nào khác giải mã được không |
| 33 | PATCH | `/api/admin/submissions/:id/status` | `admin/submissions.js:402` | Không có — mọi vai trò. Không kiểm `assigned_to` | Cán bộ đổi trạng thái hồ sơ không phụ trách |
| 34 | PATCH | `/api/admin/submissions/:id/assign` | `admin/submissions.js:457` | `authorize('admin','manager')` | **Tự phân công cho mình rồi gọi `/reveal`** — chuỗi này cần thử ở GĐ2 |
| 35 | PATCH | `/api/admin/submissions/:id/security-level` | `admin/submissions.js:476` | `authorize('admin','manager')` | Hạ mức mật để xem được |
| 36 | POST | `/api/admin/submissions/:id/review` | `admin/submissions.js:505` | Không có — mọi vai trò | Duyệt/đánh dấu rác tin ẩn danh đang chờ |
| 37 | POST | `/api/admin/submissions/:id/mark-spam` | `admin/submissions.js:639` | Không có — mọi vai trò | Chôn tin báo thật; có khoá thiết bị/IP kèm theo |
| 38 | GET | `/api/admin/logs` | `admin/logs.js:16` | `authorize('admin','manager')` — `router.use` áp cho cả file | Cán bộ thường có đọc được nhật ký không → **không** |
| 39 | GET | `/api/admin/logs/canh-bao` | `admin/logs.js:67` | `authorize('admin','manager')` — kế thừa `router.use` cùng file | |
| 40 | GET | `/api/admin/staff` | `admin/staff.js:10` | Không có — mọi vai trò | Lộ danh sách cán bộ |
| 41 | GET | `/api/admin/banned-words` | `admin/banned-words.js:10` | `authorize('admin','manager')` — `router.use` áp cho cả file | |
| 42 | POST | `/api/admin/banned-words` | `admin/banned-words.js:15` | `authorize('admin','manager')` | Gỡ/thêm từ cấm để lọt nội dung xấu |
| 43 | DELETE | `/api/admin/banned-words/:id` | `admin/banned-words.js:30` | `authorize('admin','manager')` | |
| 44 | GET | `/api/admin/qr-points` | `admin/qr-points.js:13` | Không có — mọi vai trò xem/in (chủ đích, có comment trong code) | |
| 45 | POST | `/api/admin/qr-points` | `admin/qr-points.js:29` | `authorize('admin','manager')` | |
| 46 | PATCH | `/api/admin/qr-points/:id` | `admin/qr-points.js:55` | `authorize('admin','manager')` | |
| 47 | DELETE | `/api/admin/qr-points/:id` | `admin/qr-points.js:68` | `authorize('admin','manager')` | |
| 48 | POST | `/api/admin/kiosk/submit` | `admin/kiosk.js:38` | Không có — mọi vai trò | Ghi tin "đã xác minh tại trụ sở" giả |
| 49 | GET | `/api/admin/trash` | `admin/trash.js:49` | Không có — mọi vai trò | Đọc toàn bộ tin báo đã xoá, kèm danh tính |
| 50 | POST | `/api/admin/trash/:id/restore` | `admin/trash.js:114` | Không có — mọi vai trò | |
| 51 | DELETE | `/api/admin/trash/:id` | `admin/trash.js:153` | Kiểm **thủ công** `req.staff.role !== 'admin'` trong handler — không dùng middleware `authorize()` nhưng hiệu lực tương đương | |
| 52 | DELETE | `/api/admin/trash` | `admin/trash.js:184` | Kiểm thủ công `req.staff.role !== 'admin'` | **Xoá sạch thùng rác — chỉ `admin`** |
| 53 | GET | `/api/admin/chat/:id/messages` | `admin/chat.js:31` | Không có — mọi vai trò | |
| 54 | POST | `/api/admin/chat/:id/messages` | `admin/chat.js:76` | Không có — mọi vai trò | XSS lưu trữ chiều ngược lại (cán bộ gửi) |
| 55 | GET | `/api/admin/chat/blacklist` | `admin/chat.js:134` | Không có — mọi vai trò | |
| 56 | DELETE | `/api/admin/chat/blacklist/:id` | `admin/chat.js:147` | `authorize('admin','manager')` | |
| 57 | GET | `/api/admin/chat/trusted-devices` | `admin/chat.js:175` | `authorize('admin','manager')` | |
| 58 | POST | `/api/admin/chat/trusted-devices` | `admin/chat.js:189` | `authorize('admin','manager')` | |
| 59 | DELETE | `/api/admin/chat/trusted-devices/:id` | `admin/chat.js:216` | `authorize('admin','manager')` | |
| 60 | GET | `/api/admin/chat/khieu-nai` | `admin/chat.js:239` | Không có — mọi vai trò | |
| 61 | POST | `/api/admin/chat/khieu-nai/:id/xu-ly` | `admin/chat.js:293` | `authorize('admin','manager')` | |
| 62 | GET | `/api/admin/incident-groups` | `admin/incident-groups.js:13` | Không có — mọi vai trò | |
| 63 | GET | `/api/admin/incident-groups/:id` | `admin/incident-groups.js:38` | Không có — mọi vai trò | |
| 64 | POST | `/api/admin/incident-groups/:id/ack` | `admin/incident-groups.js:63` | Không có — mọi vai trò | |
| 65 | GET | `/api/admin/news` | `admin/news.js:71` | Không có — mọi vai trò đọc (chủ đích) | **Mới, chưa từng rà.** Cột nội dung tin tức — kiểm XSS lưu trữ |
| 66 | GET | `/api/admin/news/:id` | `admin/news.js:93` | Không có — mọi vai trò | **Mới** |
| 67 | POST | `/api/admin/news` | `admin/news.js:112` | `authorize('admin','manager')` | **Mới.** Chỉ lãnh đạo viết — cán bộ tự đăng nội dung hiển thị công khai qua `GET /api/news` |
| 68 | PUT | `/api/admin/news/:id` | `admin/news.js:140` | `authorize('admin','manager')` | **Mới** |
| 69 | PATCH | `/api/admin/news/:id/hien` | `admin/news.js:174` | `authorize('admin','manager')` | **Mới** — ẩn/hiện tin |
| 70 | GET | `/api/admin/diem-den` | `admin/diem-den.js:57` | Không có — mọi vai trò đọc (chủ đích) | **Mới.** Bản quản trị của điểm đen giao thông — có cả bản ghi chưa `is_published` |
| 71 | POST | `/api/admin/diem-den` | `admin/diem-den.js:84` | `authorize('admin','manager')` | **Mới** |
| 72 | PUT | `/api/admin/diem-den/:id` | `admin/diem-den.js:108` | `authorize('admin','manager')` | **Mới** |
| 73 | PATCH | `/api/admin/diem-den/:id/hien` | `admin/diem-den.js:134` | `authorize('admin','manager')` | **Mới** — ẩn/hiện điểm đen |
| 74 | GET | `/api/admin/reports/map` | `admin/reports.js:26` | **Không có — đặt TRƯỚC dòng `router.use(authorize(...))` ở dòng 28, nên KHÔNG kế thừa nó.** Mọi vai trò đã đăng nhập gọi được | **Mới, và là ngoại lệ có chủ đích, đã có comment giải thích rõ**: chỉ trả số lượng theo địa bàn, không nội dung/danh tính. GĐ2 xác minh response thật sự không rò rỉ gì hơn thế |
| 75 | GET | `/api/admin/reports/summary` | `admin/reports.js:31` | `authorize('admin','manager')` (từ `router.use` dòng 28) | **Mới.** Xuất số liệu hiệu suất từng cán bộ |
| 76 | GET | `/api/admin/reports/details` | `admin/reports.js:196` | `authorize('admin','manager')` | **Mới.** Xuất tới `LIMIT 2000` dòng nội dung tin báo — xuất hàng loạt dữ liệu nhạy cảm |

## C. Nhóm xác thực

| # | Method | Đường dẫn | File | Ghi chú cần xác minh |
|---|---|---|---|---|
| 77 | POST | `/api/auth/login` | `routes/auth.js:88` | `loginLimiter`: 5 lần/15 phút. Không khai `keyGenerator` → mặc định `req.ip`, tức **theo IP, không theo tài khoản** |
| 78 | POST | `/api/auth/refresh` | `routes/auth.js:193` | Cookie `httpOnly` — có rotate token không? (việc của GĐ2-1) |
| 79 | POST | `/api/auth/logout` | `routes/auth.js:223` | Có thu hồi refresh token phía server, hay chỉ xoá cookie? |
| 80 | GET | `/api/auth/me` | `routes/auth.js:235` | `requireAuth` |

---

## Đối chiếu ba biến thể

Ba điểm vào dùng chung route handler (không có bản sao lệch logic), nhưng **gắn khác
router**. Dựng lại bằng cách đọc trực tiếp từng file khởi động, không suy đoán.

| Biến thể | File | Router gắn | Số endpoint (không tính health) | Health |
|---|---|---|---|---|
| **Gộp** (demo, hiện dùng) | `server/src/index.js` | Toàn bộ 12 router: `auth`, `tracking`, `chat`, `news`, `ban-do`, `khieu-nai`, `thong-ke`, `diem-den`, `tts`, `submissions`, `otp`, `ai`, **cộng** `admin` | 78 | `GET /api/health` (bản riêng, có `features`) **+** `GET /api/health/schema` (chỉ ở đây) |
| **Công khai** | `may-chu-cong-khai.js` | 11 router: `auth`, `tracking`, `chat`, `news`, `ban-do`, `khieu-nai`, `thong-ke`, `diem-den`, `tts`, `submissions`, `otp`, `ai` — **KHÔNG có `adminRouter`** (đúng như chú thích đầu file) | 30 (4 `auth` + 26 route công khai còn lại) | `GET /api/health` qua `taoApp()` (`nen-tang.js`, có `may_chu:'cong-khai'`, **không có** `features`). Không có `/schema` |
| **Cán bộ** | `may-chu-can-bo.js` | 2 router: `auth`, `admin` — **KHÔNG có bất kỳ router công khai nào khác** (không `submissions`, không `otp`, không `ai`…) | 52 (4 `auth` + 48 `admin`) | `GET /api/health` qua `taoApp()` (`may_chu:'can-bo'`). Không có `/schema`. **Thêm lớp `chanTheoIp` ở `nen-tang.js:141` gắn TRƯỚC mọi route, kể cả `/api/auth/login`** — chặn theo `ADMIN_ALLOWED_IPS`, để trống thì không chặn (mặc định demo) |

**Middleware nền chung** (`nen-tang.js`, dùng lại cho `may-chu-cong-khai.js` và
`may-chu-can-bo.js`, KHÔNG dùng lại cho `index.js` — `index.js` tự chép tay toàn bộ khối
này ở dòng 34–109): Helmet (CSP khoá hết, HSTS 2 năm), Permissions-Policy thủ công, CORS
theo allow-list origin (`CORS_ORIGIN` + `corsThem` riêng cho biến thể cán bộ), body limit
32MB kèm handler báo lỗi 413 rõ ràng, `cookieParser`, rate limit chung 300/15 phút.

**Lệch đã xác nhận giữa `index.js` và `nen-tang.js`** (ND-010, ND-012 — nợ kỹ thuật đã
biết, không mở BUG mới):
- `BACKEND_VERSION`: `index.js` = `v8-2026-07`; `nen-tang.js` = `v9-2026-08`.
- Body response `/api/health`: chỉ `index.js` có trường `features`; chỉ `nen-tang.js` có
  trường `may_chu`.
- `/api/health/schema`: chỉ tồn tại ở `index.js`, không có đường tương đương ở hai biến
  thể tách — rò rỉ tên database thật và danh sách toàn bộ database trên server chỉ xảy ra
  nếu triển khai chạy `index.js` ở production.

**Kết luận đối chiếu:** hai biến thể tách (`may-chu-cong-khai.js` + `may-chu-can-bo.js`)
cộng lại = 30 + 52 = 82 lượt gắn router, nhiều hơn 78 vì `auth` (4 endpoint) được gắn ở
**cả hai** biến thể tách (82 − 4 = 78, khớp số gốc). Đúng như thiết kế: cán bộ cũng cần
đăng nhập ở máy chủ cán bộ, không dùng chung phiên với máy chủ công khai.
