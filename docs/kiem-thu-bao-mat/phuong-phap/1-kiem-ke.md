# Giai đoạn 1 — Kiểm kê & lập bản đồ hệ thống

**Thời gian:** D1–D2 (10/09/2026 – 11/09/2026)
**Mục tiêu:** có bức tranh đầy đủ **trước khi** soi lỗi. Không rà soát trên một hệ thống mình chưa biết hết ranh giới.

---

## D1 (10/09) — Kiểm kê bề mặt tấn công

### 1.1 Danh sách endpoint (đã kiểm kê sẵn — nhiệm vụ D1 là **xác minh và điền các cột còn dấu `?`**)

Lệnh tái tạo danh sách bất cứ lúc nào:

```bash
grep -rnoE "router\.(get|post|put|patch|delete)\(" server/src/routes
```

#### A. Nhóm công khai — không cần đăng nhập (bề mặt tấn công lớn nhất)

| # | Method | Đường dẫn | File | Rate limit hiện có | Cần xác minh ở GĐ2 |
|---|---|---|---|---|---|
| 1 | GET | `/api/health` | `server/src/index.js` | chung 300/15p | Rò rỉ thông tin phiên bản? |
| 2 | GET | `/api/health/schema` | `server/src/index.js` | chung 300/15p | Endpoint chẩn đoán — đánh giá mức lộ thông tin ở production |
| 3 | POST | `/api/otp/send` | `routes/otp.js` | 5 mã/giờ/email | Bơm mail, dò email đã tồn tại |
| 4 | POST | `/api/otp/verify` | `routes/otp.js` | sai 5 lần huỷ mã | Brute-force mã 6 số |
| 5 | POST | `/api/otp/anon-code` | `routes/otp.js` | ? | Sinh mã ẩn danh hàng loạt |
| 6 | POST | `/api/otp/anon-verify` | `routes/otp.js` | ? | Brute-force mã ẩn danh |
| 7 | POST | `/api/submissions` | `routes/submissions.js` | chặn spam theo thiết bị | Payload 32MB, upload, injection |
| 8 | GET | `/api/submissions/wards` | `routes/submissions.js` | chung | — |
| 9 | GET | `/api/submissions/qr-points/:code` | `routes/submissions.js` | chung | Dò mã QR |
| 10 | POST | `/api/submissions/kiem-tra-khoa` | `routes/submissions.js` | ? | Lộ trạng thái shadow-ban cho kẻ spam |
| 11 | GET | `/api/tracking/:code` | `routes/tracking.js` | 30/phút | **Brute-force mã tra cứu 6 ký tự** |
| 12 | POST | `/api/tracking/:code/request-deletion` | `routes/tracking.js` | 30/phút | Xoá dữ liệu của người khác |
| 13 | POST | `/api/chat/open` | `routes/chat.js` | 5/15p | — |
| 14 | GET | `/api/chat/messages` | `routes/chat.js` | chung | IDOR đọc hội thoại người khác |
| 15 | POST | `/api/chat/messages` | `routes/chat.js` | 20/5p | XSS lưu trữ (cán bộ là nạn nhân) |
| 16 | GET | `/api/news` | `routes/news.js` | chung | — |
| 17 | POST | `/api/news/:id/xem` | `routes/news.js` | ? | Bơm lượt xem |
| 18 | GET | `/api/ban-do` | `routes/ban-do.js` | 20/phút | Lộ toạ độ chính xác vụ việc |
| 19 | GET | `/api/khieu-nai/trang-thai` | `routes/khieu-nai.js` | 10/10p | — |
| 20 | POST | `/api/khieu-nai` | `routes/khieu-nai.js` | 5/10p | Giới hạn 2 lần/hồ sơ — kiểm tính atomic |
| 21 | GET | `/api/tts` | `routes/tts.js` | 60/phút | SSRF / lạm dụng quota |
| 22 | GET | `/api/ai/status` | `routes/ai.js` | 30/5p | — |
| 23 | POST | `/api/ai/chat` | `routes/ai.js` | 30/5p | **Prompt injection, đốt quota key AI** |
| 24 | POST | `/api/ai/analyze` | `routes/ai.js` | 30/5p | Như trên |
| 25 | POST | `/api/ai/moderate-image` | `routes/ai.js` | 30/5p | Upload ảnh độc, đốt quota |

#### B. Nhóm quản trị — dưới `/api/admin`, đi qua `requireAuth`

| # | Method | Đường dẫn | File | `authorize()` | Cần xác minh ở GĐ2 |
|---|---|---|---|---|---|
| 26 | GET | `/api/admin/dashboard/stats` | `admin/dashboard.js` | ? | |
| 27 | GET | `/api/admin/submissions` | `admin/submissions.js` | ? | Lọc/sắp xếp → SQL injection qua `ORDER BY` |
| 28 | GET | `/api/admin/submissions/:id` | `admin/submissions.js` | ? | IDOR giữa các cán bộ |
| 29 | POST | `/api/admin/submissions/:id/reveal` | `admin/submissions.js` | `admin`,`manager` + kiểm `assigned_to` | **Điểm nóng nhất hệ thống** |
| 30 | PATCH | `/api/admin/submissions/:id/status` | `admin/submissions.js` | ? | Cán bộ đổi trạng thái hồ sơ không phụ trách |
| 31 | PATCH | `/api/admin/submissions/:id/assign` | `admin/submissions.js` | ? | **Tự phân công cho mình rồi gọi `/reveal`** |
| 32 | PATCH | `/api/admin/submissions/:id/security-level` | `admin/submissions.js` | ? | Hạ mức mật để xem được |
| 33 | POST | `/api/admin/submissions/:id/review` | `admin/submissions.js` | ? | |
| 34 | POST | `/api/admin/submissions/:id/mark-spam` | `admin/submissions.js` | ? | Chôn tin báo thật |
| 35 | GET | `/api/admin/logs` | `admin/logs.js` | ? | Cán bộ thường có đọc được nhật ký không |
| 36 | GET | `/api/admin/logs/canh-bao` | `admin/logs.js` | ? | |
| 37 | GET | `/api/admin/staff` | `admin/staff.js` | ? | Lộ danh sách cán bộ |
| 38 | GET/POST/DELETE | `/api/admin/banned-words`, `/:id` | `admin/banned-words.js` | ? | Gỡ từ cấm để lọt nội dung xấu |
| 39 | GET/POST/PATCH/DELETE | `/api/admin/qr-points`, `/:id` | `admin/qr-points.js` | ? | |
| 40 | POST | `/api/admin/kiosk/submit` | `admin/kiosk.js` | ? | Ghi tin "đã xác minh tại trụ sở" giả |
| 41 | GET/POST/DELETE | `/api/admin/trash`, `/:id/restore`, `/:id`, `/` | `admin/trash.js` | ? | **`DELETE /` xoá sạch thùng rác — ai gọi được?** |
| 42 | GET/POST/DELETE | `/api/admin/chat/*` (messages, blacklist, trusted-devices, khieu-nai) | `admin/chat.js` | ? | |
| 43 | GET/POST | `/api/admin/incident-groups`, `/:id`, `/:id/ack` | `admin/incident-groups.js` | ? | |
| 44 | GET | `/api/admin/reports/{map,summary,details}` | `admin/reports.js` | ? | Xuất hàng loạt dữ liệu nhạy cảm (`LIMIT 2000`) |

#### C. Nhóm xác thực

| # | Method | Đường dẫn | File | Ghi chú cần xác minh |
|---|---|---|---|---|
| 45 | POST | `/api/auth/login` | `routes/auth.js` | 5 lần/15 phút — theo IP hay theo username? |
| 46 | POST | `/api/auth/refresh` | `routes/auth.js` | Cookie `httpOnly` — có rotate token không? |
| 47 | POST | `/api/auth/logout` | `routes/auth.js` | Có thu hồi refresh token phía server, hay chỉ xoá cookie? |
| 48 | GET | `/api/auth/me` | `routes/auth.js` | |

> **Lưu ý kiến trúc:** ngoài `server/src/index.js` còn có `may-chu-cong-khai.js`, `may-chu-can-bo.js`
> và `nen-tang.js` — ba biến thể khởi động khác nhau. **Phải kiểm cả ba**: một lớp bảo vệ có ở
> `index.js` nhưng thiếu ở `nen-tang.js` là lỗ hổng thật nếu production chạy biến thể kia.

**Việc phải làm D1:** điền hết dấu `?`. Mỗi dấu `?` chưa điền là một điểm mù — và điểm mù
trong code do AI sinh ra thường chính là chỗ thiếu kiểm tra quyền.

### 1.2 Thành phần hệ thống & bên thứ ba

| Thành phần | Vai trò | Dữ liệu nhạy cảm đi qua? | Cần kiểm |
|---|---|---|---|
| Frontend React SPA (Netlify/Vercel) | Giao diện | Có (trước khi gửi) | Header bảo mật `public/_headers` và `vercel.json` **phải khớp nhau** |
| Backend Express (Render) | API | Có | `render.yaml`, biến môi trường thật |
| MySQL | Lưu trữ | Có (danh tính đã mã hoá) | TLS tới DB (`server/ca.pem`), quyền của user DB |
| Cloudinary | Ảnh bằng chứng | Có | Upload preset unsigned → người ngoài upload được không? |
| Google Gemini | Phân loại/chat AI | **Nội dung tố giác rời khỏi hệ thống** | Có gửi kèm danh tính không? Nhà cung cấp lưu bao lâu? |
| Brevo / Resend / SMTP | Email OTP | Email người dùng | Khoá API, SPF/DKIM, nội dung mail có lộ gì không |
| Cloudflare Turnstile | CAPTCHA | Không | Có verify **phía server** không, hay chỉ frontend |

### 1.3 Đầu ra D1
- [x] Bảng endpoint đã điền đủ (không còn `?`) — lưu tại [kiem-ke-endpoint.md](kiem-ke-endpoint.md) (phiên P01)
- [ ] Sơ đồ thành phần + bên thứ ba
- [ ] Danh sách biến môi trường thật đang dùng trên Render, đối chiếu `server/.env.example`

---

## D2 (11/09) — Luồng dữ liệu nhạy cảm & giới hạn nghiệp vụ

### 2.1 Vẽ 5 luồng dữ liệu nhạy cảm

Mỗi luồng vẽ theo mẫu:
`Nhập → Kiểm tra frontend → Truyền → Kiểm tra backend → Xử lý → Lưu → Đọc lại → Xoá`
Ở mỗi mũi tên ghi rõ ba thứ: **mã hoá bằng gì, ai đọc được, có ghi log không.**

1. **Mật khẩu cán bộ** — form đăng nhập → `/api/auth/login` → bcryptjs → bảng `staff`.
   *Câu hỏi:* cost factor bao nhiêu? Đổi mật khẩu có thu hồi phiên cũ không?
2. **Danh tính người tố giác** (tên, SĐT, email) — form → `/api/submissions` → `lib/crypto.js` → cột `sender_*`.
   *Câu hỏi:* khoá nằm ở đâu, xoay khoá thế nào? Ngoài `/reveal` còn đường nào giải mã được?
3. **Nội dung tố giác** — form → lá chắn `src/utils/security.ts` → backend `lib/security.js` → DB.
   *Câu hỏi:* payload gửi sang Gemini có kèm danh tính không? Prompt có bị log lại không?
   ⚠️ **P02 đính chính:** mô tả cũ ở dòng này ghi nội dung "gửi sang Gemini để phân loại" là
   **sai với code hiện tại** — phân loại chạy thuần luật từ khoá trong `lib/phan-loai.js`,
   không gọi mạng. Đường duy nhất ra Gemini là `POST /api/ai/chat`.
4. **Ảnh/video bằng chứng** — chọn file → tái mã hoá canvas → kiểm duyệt AI → Cloudinary **hoặc** base64 vào DB.
   *Câu hỏi:* nhánh fallback base64 có áp cùng giới hạn kích thước/định dạng như nhánh Cloudinary không?
5. **Mã tra cứu 6 ký tự** — sinh ở backend → hiển thị một lần → dùng ở `/api/tracking/:code`.
   *Câu hỏi:* entropy bao nhiêu bit? Có đủ chống dò ở mức 30 request/phút không?

### 2.2 Kiểm kê giới hạn nghiệp vụ (đã trích sẵn từ code — việc của D2 là xác minh nơi thực thi)

| Giới hạn | Giá trị | Nguồn trong code | Thực thi ở đâu? | Ghi chú rủi ro |
|---|---|---|---|---|
| Rate limit toàn cục | 300 req / 15 phút | `index.js:89` · `nen-tang.js:89` | **Cả ba biến thể.** `index.js` gắn trực tiếp; `may-chu-cong-khai.js` và `may-chu-can-bo.js` nhận qua `taoApp()`. Gắn **trước** mọi route nên phủ cả `/api/admin`. Khoá theo `req.ip` (mặc định `express-rate-limit@7.5.1`), có `trust proxy = 1` | Lưu **trong RAM** từng instance → nhiều instance = hạn mức nhân lên (ND-009) |
| Đăng nhập | 5 lần / 15 phút | `routes/auth.js:30` | Backend, **cả ba biến thể** (`authRouter` gắn ở cả ba, kể cả máy chủ cán bộ). **Theo IP, không theo tài khoản** — không khai `keyGenerator` nên dùng mặc định `req.ip` | Trả lời câu hỏi cũ: **theo IP**. Hệ quả hai chiều: nhiều IP dò một tài khoản thì lớp này không thấy; ngược lại cả cơ quan chung một IP ra Internet thì 5 lượt là của chung |
| Gọi AI | 30 lần / 5 phút / IP | `routes/ai.js:11` | Backend công khai (`index.js`, `may-chu-cong-khai.js`). `router.use(aiLimiter)` → **bốn route AI dùng chung một hạn mức**. Khoá `req.ip` mặc định | Máy chủ cán bộ không nạp `aiRouter` — mặt tấn công AI chỉ nằm ở phía công khai |
| Mở phòng chat | 5 / 15 phút | `routes/chat.js:66` | Backend công khai, gắn đúng vào `POST /open` (`chat.js:100`). Khoá `req.ip` mặc định | |
| Gửi tin chat | 20 / 5 phút | `routes/chat.js:75` | Backend công khai, gắn đúng vào `POST /messages` (`chat.js:208`). Khoá `req.ip` mặc định | `GET /messages` (`chat.js:166`) **không có** giới hạn riêng — chỉ còn 300/15p chung |
| Tra cứu | 30 / phút | `routes/tracking.js:22` | Backend công khai, khoá theo `layIpThat(req)`. **Chỉ gắn vào `GET /:code`** (`tracking.js:31`) | `POST /:code/request-deletion` (`tracking.js:143`) không có giới hạn riêng — xem ghi chú P01 trong `buglogs/` |
| Bản đồ | 20 / phút | `routes/ban-do.js:35` | Backend công khai, gắn đúng vào `GET /` (`ban-do.js:44`) | |
| TTS | 60 / phút | `routes/tts.js:32` | Backend công khai, gắn đúng vào `GET /` (`tts.js:56`) | |
| Khiếu nại | 5 / 10 phút **và tối đa 2 lần/hồ sơ** | `routes/khieu-nai.js:29,33` | Cả hai đều ở backend công khai. 5/10p là middleware khoá `layIpThat`, **dùng chung một bộ đếm cho cả `GET /trang-thai` và `POST /`** (`khieu-nai.js:46,98`). Giới hạn 2 lần/hồ sơ là `SELECT COUNT(*)` (`:125,:136`) rồi `INSERT` (`:148`) — **hai câu lệnh rời, không transaction, không khoá hàng** | **Ưu tiên kiểm — đúng khuôn "đếm rồi ghi" của luật 6.** Thêm một điểm: giao diện gọi `GET /trang-thai` trước khi hiện nút, nên lượt đọc ăn vào hạn mức của lượt ghi |
| OTP | 5 mã/giờ/email; sai 5 lần huỷ mã; chờ 60s giữa hai lần xin; mã sống **10 phút** | `routes/otp.js:31–34` (bản **đang chạy**) | Backend công khai. **Không dùng `express-rate-limit`** — đếm bằng `SELECT COUNT(*) … INTERVAL 1 HOUR` (`otp.js:56`) rồi `INSERT` (`otp.js:83`), cùng khuôn không atomic như trên. Số lần sai thì atomic (`UPDATE … attempts = attempts + 1`, `otp.js:147`) | **Ưu tiên kiểm.** ⚠️ Bảng cũ dẫn nguồn `lib/otp.js:8,10` là **bản chết** — không tệp nào import `lib/otp.js`, và nó lệch bản đang chạy (TTL 5 phút vs 10 phút, băm SHA-256 vs bcrypt). Xem ND-013 |
| Số ảnh đính kèm | tối đa 3 | `lib/anh-an-toan.js:31` | Backend, **hai lớp**: `submissions.js:90` cắt `slice(0, 3)`, rồi `locDanhSachAnh` cắt lại `slice(0, SO_ANH_TOI_DA)` (`anh-an-toan.js:201`) | Có cắt thật. `admin/kiosk.js` không nhận ảnh nên không đụng lớp này |
| Kích thước ảnh | 8 MB | `lib/anh-an-toan.js:28` | Backend, **chỉ nhánh base64** — đo trên byte đã giải mã (`anh-an-toan.js:89`). Nhánh Cloudinary nhận đường dẫn nên không đo được kích thước ở đây, chỉ kiểm giao thức/miền/đuôi tệp (`anh-an-toan.js:150–184`) | Trả lời câu hỏi cũ: **nhánh base64 chính là nhánh có áp 8 MB**. Trần thật của nhánh này là `express.json` 32 MB ở trên. Kích thước ảnh qua Cloudinary do Cloudinary chặn, không do hệ thống này |
| Kích thước video | base64 ≤ 22 MB chuỗi (≈ 16 MB tệp thật); link kho ảnh thì không đo | `routes/submissions.js:517` | Backend công khai, ngay trong `POST /api/submissions`. Kiểm hai dạng: link phải là `res.cloudinary.com/<cloud_name>/`, hoặc `data:video/…` | **Dòng này P02 bổ sung** — bảng cũ không có. ⚠️ Video **không** được tái mã hoá như ảnh, nên dữ liệu bên trong tệp (có thể gồm nơi quay) giữ nguyên |
| Kích thước body | 32 MB | `index.js:85` · `nen-tang.js:87` | Backend, cả ba biến thể | DoS bộ nhớ khi nhiều request đồng thời. *(Bảng cũ ghi `index.js:82` — số dòng đã trôi)* |
| Độ dài nội dung | 2000 ký tự | `lib/security.js:11` | Backend, **chỉ ở `POST /api/submissions`** qua `sanitizeText(body.content)` (`submissions.js:84`). `admin/kiosk.js:40` đọc nội dung bằng `String(b.content \|\| '').trim()` — **không qua `sanitizeText`, không có trần trên** | Đường ki-ốt không đi qua lá chắn `security.js`: không cắt độ dài, không quét mẫu đáng ngờ. Xem ghi chú P02 trong `buglogs/` |
| Độ dài tin chat | 1000 ký tự | `routes/chat.js:45`, `admin/chat.js:21` | Backend, cả hai phía — `sanitizeText(msg, MAX_DAI_TIN)` ở `chat.js:216` và `admin/chat.js:78` | Hai bản chép hằng số riêng, hiện bằng nhau |
| Khoá thiết bị spam | 24 giờ | `lib/chan-spam.js:39` | Backend công khai, `xetTruocKhiNhan()` gọi từ `routes/submissions.js`. Mã thiết bị lấy từ **`req.body.deviceId`** (`chan-spam.js:55`) — do trình duyệt tự sinh và gửi lên | Trả lời câu hỏi cũ: **đổi `deviceId` là thoát khoá** — nhưng đây là **đánh đổi đã ghi rõ** ở đầu `chan-spam.js` (khoá theo IP sẽ chặn oan cả vùng CGNAT), và cơ chế chặn ngầm sinh ra chính vì biết điều đó. Không phải sơ suất |
| Khoá IP spam | 2 giờ; ngưỡng 3 đơn / 3 thiết bị / 1 giờ | `lib/chan-spam.js:40,44–46` | Backend công khai, `xetKhoaIp()` (`chan-spam.js:356`), khoá theo `layIpThat` | Lớp dự phòng, cố ý đặt ngưỡng cao. Thêm nhánh tái phạm: 3 lần/30 ngày → khoá 30 ngày (`chan-spam.js:181–185`) |
| Thùng rác giữ | 7 ngày | `routes/admin/trash.js:24` | **Backend, không phải DB.** `donRacQuaHan()` chạy `DELETE FROM submissions … deleted_at < NOW() - INTERVAL 7 DAY` (`trash.js:32–36`), gọi **mỗi lần cán bộ mở thùng rác**. Không có cron, không có EVENT trong `database/` | Trả lời câu hỏi cũ: **xoá thật, nhưng lười** — không ai mở thùng rác thì dữ liệu đã xoá mềm nằm lại quá 7 ngày. Nguồn dẫn trong bảng cũ (`nang_cap_v7.sql`) chỉ định nghĩa cột và khung nhìn, không thực thi hạn giữ |

**Với mỗi dòng, GĐ2 phải trả lời đúng 3 câu:**
1. Giới hạn này có kiểm ở **backend** không, hay chỉ ẩn nút ở frontend?
2. Gửi nhiều request **song song** có lách qua được không (đọc–kiểm–ghi không atomic)?
3. Đổi tham số trong request (`deviceId`, `staffId`, `assigned_to`, `status`, `security_level`) có lách được không?

### 2.3 Đầu ra D2
- [x] 5 sơ đồ luồng dữ liệu nhạy cảm — lưu tại [luong-du-lieu-nhay-cam.md](luong-du-lieu-nhay-cam.md) (phiên P02)
- [x] Bảng giới hạn nghiệp vụ đã điền cột "Thực thi ở đâu" — §2.2 ở trên (phiên P02)
- [x] Danh sách điểm nghi ngờ sơ bộ → `buglogs/ghi-chu-P02-diem-nghi.md` (nội bộ); bảng phân việc cho P03–P08 ở cuối [luong-du-lieu-nhay-cam.md](luong-du-lieu-nhay-cam.md)
