# Năm luồng dữ liệu nhạy cảm — bản đồ chi tiết

**Phiên:** P02 (`KHAO-SAT`) · **Ngày:** 2026-09-10 · **Mốc:** `c02088d`
**Đầu ra của:** [01-GIAI-DOAN-1-KIEM-KE.md](01-GIAI-DOAN-1-KIEM-KE.md) §2.1

> ⚠️ **File này công khai trên GitHub.** Ở đây chỉ mô tả **luồng đi của dữ liệu**.
> Đánh giá điểm yếu và điểm nghi ngờ nằm trong `buglogs/ghi-chu-P02-diem-nghi.md`
> (nội bộ, đã gitignore) — luật 10 trong `CLAUDE.md`.

> ⚠️ Toàn bộ nội dung dưới đây là **đọc code tĩnh**, chưa chạy thực nghiệm lần nào.
> Phiên `KHAO-SAT` không chấm mức độ nghiêm trọng và không kết luận lỗ hổng.

---

## Cách đọc

Mỗi luồng theo khung: `Nhập → Kiểm frontend → Truyền → Kiểm backend → Xử lý → Lưu → Đọc lại → Xoá`.
Ở mỗi chặng ghi ba thứ bắt buộc: **mã hoá bằng gì · ai đọc được · có ghi log không**.

Ký hiệu: 🔒 mã hoá thuận nghịch · #️⃣ băm một chiều · 📝 có ghi nhật ký · 👁 ai đọc được.

---

## Luồng 1 — Mật khẩu cán bộ

```
Form đăng nhập (src/) ──HTTPS──> POST /api/auth/login ──bcrypt.compare──> bảng staff
                                       │
                                       ├─ sai 3 lần ──> bắt qua Turnstile
                                       └─ đúng ──> access token (JWT 8h)
                                                 + refresh token (cookie 30 ngày)
```

| Chặng | Chi tiết |
|---|---|
| Nhập | Chỉ `username` + `password`, thêm `captchaToken` khi đã sai ≥ 3 lần |
| Kiểm frontend | Không tính là lớp bảo vệ (luật 2) |
| Truyền | HTTPS. Cookie `refreshToken`: `httpOnly` + `secure` **mặc định bật**, chỉ tắt khi `CLIENT_URL` chứa `localhost`/`127.0.0.1` (`auth.js:45-55`) · `sameSite: 'lax'` · `path: '/api/auth'` |
| Kiểm backend | 5 lần/15 phút **theo IP** (`auth.js:30`) · thêm lớp theo **tài khoản**: `failed_attempts` ≥ 3 → bắt Turnstile (`auth.js:71,117`) |
| Xử lý | 🔒 Không — mật khẩu #️⃣ **bcrypt**. Hạt giống trong `database/` dùng cost **12**. So sánh **luôn chạy** kể cả khi không tìm thấy tài khoản, đối chiếu với `DUMMY_HASH` (`auth.js:27,129`) để thời gian phản hồi không lộ tài khoản nào có thật |
| Lưu | `staff.password_hash` (#️⃣ bcrypt) · `refresh_tokens.token_hash` (#️⃣ SHA-256 của 40 byte ngẫu nhiên, `token.js:105-107`) — bảng không giữ token thô |
| Đọc lại | 👁 Không ai. Không route nào trả `password_hash` |
| 📝 Log | Cả **thành công** (`action='login'`) lẫn **thất bại** (`ghiThatBai`) đều vào `staff_activity_logs` kèm IP |
| Xoá | `POST /logout` đặt `revoked = TRUE` cho đúng hàng refresh token (`auth.js:224-228`) — thu hồi **phía máy chủ**, không chỉ xoá cookie |

**Trả lời câu hỏi §2.1:**

- *Cost factor bao nhiêu?* → **12** (hạt giống trong `database/*.sql`; `DUMMY_HASH` cũng 12).
- *Đổi mật khẩu có thu hồi phiên cũ không?* → **Hệ thống không có chức năng đổi mật khẩu.**
  Không route nào trong `server/src/routes/` gọi `bcrypt.hash` cho `staff.password_hash`;
  `admin/staff.js` không đụng tới cột này. Mật khẩu chỉ đổi được bằng cách sửa thẳng
  database — và cách đó **không** thu hồi `refresh_tokens` đang sống (tối đa 30 ngày) hay
  access token đang lưu hành (tối đa 8 giờ).

**Ghi chú thêm:** truy vấn đăng nhập có `SELECT … locked_until` nhưng không dòng nào trong
`auth.js` đọc giá trị đó — cột được lấy về rồi bỏ đi. Không phải lỗi bảo mật (khoá tài khoản
là thứ file này **cố ý không làm**, có giải thích dài ở `auth.js:57` trở đi), nhưng là dấu vết
của một cơ chế đã bỏ dở.

---

## Luồng 2 — Danh tính người tố giác (tên, SĐT, email)

**Đây là luồng quan trọng nhất của hệ thống.**

```
Form gửi ý kiến ──HTTPS──> POST /api/submissions
   │
   ├─ Turnstile (ẩn danh: BẮT BUỘC)
   ├─ sanitizeText / normalizePhone
   ├─ 🔒 encrypt()   ── AES-256-GCM ──> sender_name · sender_phone · sender_email
   ├─ #️⃣ hashPhone()  ── HMAC-SHA256 + HASH_PEPPER ──> sender_phone_hash
   └─ #️⃣ hashIdentifier(ip) ──> ip_address (32 ký tự — KHÔNG lưu IP thô)
```

| Chặng | Chi tiết |
|---|---|
| Nhập | `fullName` ≤ 100 · `phone` chuẩn hoá · `email` ≤ 100. Tin ẩn danh: cả ba **null**, không có gì để mã hoá |
| Kiểm backend | `assertEncryptionReady()` — thiếu/sai `ENCRYPTION_KEY` thì **ném lỗi, route trả 503, không lưu gì** (`crypto.js:82`). Đây là hiện thân của luật 1 |
| Xử lý | 🔒 **AES-256-GCM**, IV 12 byte ngẫu nhiên mỗi lần, tiền tố `enc:v1:` (`crypto.js:96-107`). Khoá: `ENCRYPTION_KEY` 64 ký tự hex, đọc từ biến môi trường, cache một lần |
| | #️⃣ Định danh dùng để đối chiếu (`sender_phone_hash`, `ip_address`) băm bằng **HMAC-SHA256 với `HASH_PEPPER`** (≥ 32 ký tự, thiếu thì ném lỗi). Pepper **không nằm trong database** — lộ database vẫn không dựng được bảng tra ngược, dù miền SĐT di động VN chỉ khoảng 10⁸ |
| Lưu | Cột `sender_*` trong `submissions`. **IP thô không bao giờ vào database** (`submissions.js:96-110`) — vì với tin ẩn danh, bộ ba IP + user-agent + thời điểm ở địa bàn xã gần như trỏ đích danh một hộ dân |
| Đọc lại | Toàn backend chỉ có **9 điểm gọi `decrypt()`**, tất cả dưới `/api/admin` — xem bảng dưới |
| 📝 Log | `/reveal` ghi `staff_activity_logs` **trước khi** trả dữ liệu (`admin/submissions.js:381-387`). Các đường đọc che sẵn thì **không ghi log** |
| Xoá | `POST /api/tracking/:code/request-deletion` → hồ sơ đã đóng thì xoá ngay (`sender_* = NULL`, `identity_erased = TRUE`); hồ sơ đang mở thì ghi nhận, tự xoá lúc chuyển sang `resolved`/`rejected` (`admin/submissions.js:414-418`) |

### Toàn bộ đường giải mã danh tính

| Điểm gọi `decrypt()` | Route | Quyền | Che? | Ghi log? |
|---|---|---|---|---|
| `admin/submissions.js:390-392` | `POST /submissions/:id/reveal` | `admin`,`manager` **+** phải là người được phân công (trừ `admin`) | Không — trả đầy đủ, có chủ đích | **Có** |
| `admin/submissions.js:333-335` | `GET /submissions/:id` | chỉ `requireAuth` | Tên `maskName`, SĐT `maskPhone` | Không |
| `admin/submissions.js:266` | `GET /submissions` (danh sách) | chỉ `requireAuth` | `maskName` | Không |
| `admin/dashboard.js:142` | `GET /dashboard/stats` | chỉ `requireAuth` | `maskName` | Không |
| `admin/reports.js:231` | `GET /reports/details` | `admin`,`manager` | `maskName` | Không |

**Trả lời câu hỏi §2.1:**

- *Khoá nằm ở đâu?* → biến môi trường `ENCRYPTION_KEY` trên máy chủ (Render). Không có
  trong database, không có trong repo.
- *Xoay khoá thế nào?* → **chưa có cơ chế.** Tiền tố `enc:v1:` đã dành sẵn chỗ cho phiên bản
  khoá, nhưng trong `database/` không có script xoay khoá hay cột đánh dấu phiên bản khoá nào.
  Đổi `ENCRYPTION_KEY` là mọi bản ghi cũ trả về `[Dữ liệu hỏng hoặc sai khoá]` (`crypto.js:119`).
- *Ngoài `/reveal` còn đường nào giải mã được?* → **có, bốn đường** (bảng trên). Bốn đường đó
  đều đi qua `maskName`/`maskPhone` trước khi trả. **Một trong bốn cần P04 xem lại kỹ** —
  chi tiết ở `buglogs/ghi-chu-P02-diem-nghi.md`.

---

## Luồng 3 — Nội dung tố giác

> ⚠️ **Mô tả trong §2.1 đã lỗi thời.** §2.1 ghi nội dung "gửi sang Gemini để phân loại".
> Đọc code thì **không phải vậy nữa**: phân loại chạy hoàn toàn nội bộ.

```
Form ──> src/utils/security.ts (lá chắn trình duyệt, KHÔNG tính là bảo vệ)
      ──HTTPS──> POST /api/submissions
                    ├─ sanitizeText()        — cắt 2000 ký tự, lọc ký tự điều khiển
                    ├─ scanTextForThreats()  — 9 mẫu đáng ngờ
                    ├─ kiemTraNoiDungNham()  — từ cấm
                    └─ phanLoaiNoiDung()     ← THUẦN LUẬT TỪ KHOÁ, KHÔNG GỌI AI
                    ──> submissions.original_content  (LƯU CHỮ TRẦN, không mã hoá)
```

| Chặng | Chi tiết |
|---|---|
| Kiểm backend | `sanitizeText` (`security.js:33`) cắt 2000 ký tự, bỏ ký tự điều khiển và ký tự vô hình (zero-width, bidi override) · `scanTextForThreats` quét 9 mẫu (script, iframe, `javascript:`, `on*=`, SQL `UNION SELECT`, template injection…) |
| Xử lý | `phanLoaiNoiDung()` trong `lib/phan-loai.js` — **1458 dòng luật từ khoá tiếng Việt đã bỏ dấu**, không gọi mạng. `POST /api/ai/analyze` cũng dùng đúng hàm này và ghi rõ "PHÂN LOẠI HOÀN TOÀN NỘI BỘ" (`ai.js:31`) |
| Lưu | 🔒 **Không mã hoá.** `original_content` và `ai_processed_content` lưu chữ trần. Cân nhắc đã rõ: cán bộ phải đọc được để xử lý, và mã hoá nội dung sẽ chặn luôn tìm kiếm/phân loại. Lớp bảo vệ đặt ở **danh tính**, không ở nội dung |
| Đọc lại | 👁 Mọi cán bộ đã đăng nhập (`GET /admin/submissions/:id` không kiểm vai trò) · **và bất kỳ ai biết mã tra cứu 6 ký tự** — `GET /api/tracking/:code` trả nguyên `original_content` (`tracking.js:37`) |
| 📝 Log | Không ghi log việc đọc nội dung |

### Nội dung có rời khỏi hệ thống không?

**Đúng một đường duy nhất:** `POST /api/ai/chat` → `geminiChat()` → API Google Gemini.

| Điều đã kiểm | Kết quả |
|---|---|
| `POST /api/submissions` có gọi Gemini không? | **Không.** `routes/submissions.js` không import gì từ `lib/ai.js` |
| `POST /api/ai/analyze` | **Không gọi mạng** — dùng `phanLoaiNoiDung` nội bộ |
| `POST /api/ai/moderate-image` | **Đã gỡ hẳn**, trả sẵn `{blocked:false}`. Lý do ghi trong code: ảnh bằng chứng có thể chứa mặt người, biển số, địa chỉ |
| Hàm có kiểm từ khoá tố giác trước khi gọi Gemini | **Không route nào gọi tới** — `routes/ai.js` chỉ import `aiAvailable` và `geminiChat` |
| `POST /api/ai/chat` gửi gì? | Đúng `message` người dùng gõ vào khung trợ lý + tối đa 6 lượt hội thoại gần nhất, mỗi lượt ≤ 800 ký tự (`ai.js:222-228`). Frontend gọi từ `src/services/aiService.ts:128`, chỉ truyền nội dung khung chat |
| Danh tính có đi kèm không? | **Không.** Thân yêu cầu chỉ có `message` và `history` |
| Prompt có bị log lại không? | Phía hệ thống này: không ghi nội dung prompt vào log (chỉ `console.warn` khi lỗi hoặc hết hạn mức). Phía Google: **ngoài tầm kiểm soát** — khối chú thích ở `lib/ai.js:246` nói rõ gói Gemini miễn phí cho phép Google dùng dữ liệu để cải thiện mô hình, và đó chính là lý do luồng gửi đơn không đi qua Gemini |

**Còn lại một khoảng hở không nằm ở code:** không có gì ngăn người dân **tự dán** nội dung tố
giác vào khung trợ lý. Đó là chuyện hướng dẫn sử dụng và lời nhắc trên giao diện, không phải
chuyện sửa code — ghi ra đây để P06 quyết định có cần cảnh báo trên khung chat hay không.

---

## Luồng 4 — Ảnh và video bằng chứng

```
Chọn tệp ──> trình duyệt tái mã hoá qua canvas (xoá EXIF) ──> heuristic tỷ lệ màu da
   │
   ├─ có Cloudinary ──> tải thẳng lên Cloudinary, chỉ gửi LINK về backend
   └─ không có       ──> gửi data URL base64 trong thân yêu cầu (đường lui)
                            │
   POST /api/submissions ───┴──> locDanhSachAnh()
                                   ├─ link  : kiemTraLinkCloudinary()
                                   └─ base64: kiemTraAnhBase64()
                                 ──> submission_images.image_url
```

| Chặng | Chi tiết |
|---|---|
| Kiểm frontend | Tái mã hoá canvas (bỏ EXIF, trong đó có toạ độ GPS) + đo tỷ lệ màu da để cảnh báo ảnh nhạy cảm. **Cả hai đều không tính là bảo vệ** — cờ `anhNghiNgo` do trình duyệt gửi lên, tự đặt được |
| Kiểm backend — nhánh base64 | ≤ **8 MB** sau giải mã · chữ ký nhị phân phải khớp một trong 5 định dạng (JPEG/PNG/GIF/WebP/BMP — **không có SVG**, vì SVG là XML chạy được script) · quét 12 dấu vết mã thực thi trong thân tệp (chống tệp "polyglot" vừa là ảnh vừa là HTML) |
| Kiểm backend — nhánh link | Bắt buộc `https` · host phải đúng `res.cloudinary.com` · đường dẫn phải bắt đầu bằng `/<cloud_name>/` của đơn vị (thiếu bước này thì kẻ xấu dùng Cloudinary của họ) · chặn đuôi `.svg .html .js .php .xml` |
| | ⚠️ Nhánh link **không đo được kích thước** — đó là việc của Cloudinary, không phải của hệ thống này |
| Số lượng | ≤ **3 ảnh**, cắt hai lớp (`submissions.js:90` và `anh-an-toan.js:201`) |
| Video | Link kho ảnh, hoặc base64 ≤ **22 MB chuỗi** (≈ 16 MB tệp thật). ⚠️ **Video KHÔNG được tái mã hoá** — thông tin trong tệp (có thể gồm nơi quay) giữ nguyên; giao diện có báo trước cho người gửi. Giới hạn 22 MB này **chưa có trong bảng §2.2** trước phiên P02 |
| Lưu | 🔒 Không mã hoá. `submission_images.image_url` giữ **hoặc** link Cloudinary **hoặc** nguyên chuỗi base64 → đúng món nợ **ND-008** |
| Ba mức kết luận | `safe` (lưu bình thường) · `review` (vẫn lưu, ẩn khỏi ngoài, chờ cán bộ xem — kéo cả hồ sơ sang `pending_review`) · `blocked` (không lưu). Chỉ chặn khi **chắc chắn về mặt kỹ thuật**; nghi ngờ về nội dung thì chuyển người xem, vì chặn nhầm ảnh bằng chứng là mất luôn nguồn tin |
| 📝 Log | Ảnh bị chặn ghi `console.warn` kèm mã tra cứu — **không** vào bảng log |

**Trả lời câu hỏi §2.1** — *nhánh fallback base64 có áp cùng giới hạn kích thước/định dạng như
nhánh Cloudinary không?*

→ **Ngược lại là đằng khác:** nhánh base64 bị kiểm **chặt hơn** (kích thước + chữ ký nhị phân +
quét mã nhúng), vì đó là nhánh dữ liệu thật đi vào database. Nhánh Cloudinary chỉ kiểm được
**nguồn gốc** của đường dẫn, không nhìn thấy nội dung tệp. Cả hai chung trần ≤ 3 tệp.

---

## Luồng 5 — Mã tra cứu 6 ký tự

```
POST /api/submissions ──> generateTrackingCode()  (crypto.randomInt, bảng chữ 31 ký tự)
                            └─ kiểm trùng trong DB, sinh lại nếu đụng
                          ──> trả về MỘT LẦN cho người gửi
                                    │
GET /api/tracking/:code <───────────┘   30 lượt/phút/IP
```

| Chặng | Chi tiết |
|---|---|
| Sinh | `helpers.js:6` — `crypto.randomInt` (nguồn ngẫu nhiên mật mã, không phải `Math.random`), bảng chữ `ABCDEFGHJKMNPQRSTUVWXYZ23456789` = **31 ký tự**, bỏ các cặp dễ đọc nhầm `0/O` và `1/I/L` |
| Entropy | 31⁶ = **887.503.681** tổ hợp ≈ 2^29,7 ≈ **29,7 bit** |
| Kiểm trùng | `SELECT 1 … WHERE tracking_code=?` rồi sinh lại nếu đụng (`submissions.js:280-284`) — **cùng khuôn "đọc rồi ghi" không atomic**, nhưng hậu quả ở đây là trùng mã, không phải lách hạn mức |
| Truyền | Hiện **một lần** trên màn hình sau khi gửi. Không gửi lại qua email hay SMS |
| Kiểm backend khi tra | `/^[A-Z0-9]{6}$/`, chuẩn hoá chữ hoa · 30 lượt/phút khoá theo `layIpThat` |
| Trả về gì | `original_content` **đầy đủ**, nhóm xử lý, trạng thái, lý do từ chối, hạn xử lý, toàn bộ lịch sử chuyển trạng thái (`tracking.js:37-56`). **Không** trả `sender_*` |
| 📝 Log | Không ghi log lượt tra cứu — kể cả lượt tra trượt |
| Xoá | Mã sống cùng hồ sơ. `request-deletion` xoá danh tính nhưng **giữ nguyên** nội dung và mã |

**Trả lời câu hỏi §2.1** — *29,7 bit có đủ chống dò ở mức 30 request/phút không?*

Phải tách làm hai bài toán, vì câu trả lời khác hẳn nhau:

| Bài toán | Phép tính | Kết quả |
|---|---|---|
| Dò **đúng một** mã đã biết trước | 8,875×10⁸ ÷ 2 ÷ 43.200 lượt mỗi ngày | ≈ **10.000 ngày-IP** để đạt 50% |
| Dò **bất kỳ** mã nào có thật | với N hồ sơ trong kho: kỳ vọng ≈ 8,875×10⁸ ÷ N lượt | N = 10.000 → ≈ **88.750 lượt** ≈ **2 ngày-IP** |

Bài toán thứ hai mới là bài toán thật, và chi phí của nó **giảm tuyến tính theo số hồ sơ trong
hệ thống** — dùng càng lâu càng rẻ để dò trúng. Ba biến số cần P05/P08 xác định bằng thực
nghiệm: hạn mức có khoá đúng theo IP thật không (CGNAT thì nhiều người chung một hạn mức), có
siết thêm khi tra trượt liên tiếp không, và lượt tra trượt có để lại dấu vết nào không.

---

## Điểm chuyển sang Giai đoạn 2

Danh sách điểm nghi ngờ cụ thể nằm ở `buglogs/ghi-chu-P02-diem-nghi.md` (nội bộ).
Ở đây chỉ ghi **phiên nào nhận việc gì**:

| Chuyển cho | Nội dung |
|---|---|
| **P03** (xác thực) | Không có chức năng đổi mật khẩu; refresh token 30 ngày không xoay vòng; `locked_until` đọc rồi bỏ |
| **P04** (phân quyền/IDOR) | Ma trận đường giải mã danh tính ở Luồng 2 — từng dòng phải kết luận chủ đích hay bỏ sót |
| **P05** (input) | Đường ki-ốt không đi qua `sanitizeText` (xem §2.2 dòng "Độ dài nội dung") |
| **P05/P08** | Entropy mã tra cứu đặt cạnh hạn mức 30/phút — bài toán "dò bất kỳ" ở trên |
| **P06** (bảo vệ dữ liệu) | Chưa có cơ chế xoay `ENCRYPTION_KEY`; video không tái mã hoá; lời nhắc trên khung trợ lý AI |
| **P08** (giới hạn) | Giới hạn video 22 MB — đã bổ sung vào §2.2 ở phiên này |

---

## Việc P02 KHÔNG làm

- Không chạy thực nghiệm — toàn bộ là đọc code tĩnh.
- Không chấm mức độ nghiêm trọng, không mở `bugs/BUG-xxx.md` (việc của phiên `RA-SOAT`).
- Không kiểm thực tế biến môi trường trên Render (ô còn lại của §1.3).
- Không vẽ sơ đồ thành phần + bên thứ ba (ô còn lại của §1.3).
