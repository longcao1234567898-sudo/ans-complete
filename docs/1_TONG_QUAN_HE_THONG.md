# Tổng quan hệ thống — Hộp Thư An Ninh Số

Nền tảng web tiếp nhận, phân loại và quản lý ý kiến, phản ánh, tố giác của công dân, phục vụ Công an cấp cơ sở.

Bản cấu hình hiện tại: **Công an thị xã Tân Châu, tỉnh An Giang**.

---

## 1. Hệ thống làm được gì

### Phía công dân

| Chức năng | Mô tả |
|---|---|
| Gửi ý kiến 24/7 | Quy trình 5 bước, không cần tài khoản |
| Gửi ẩn danh | Không khai danh tính; tin ẩn danh qua hàng chờ kiểm duyệt trước khi vào xử lý |
| Đính kèm | Ảnh bằng chứng và toạ độ vị trí vụ việc |
| Tra cứu tiến độ | Mã 6 ký tự, xem được toàn bộ các bước xử lý |
| Trợ lý hỏi đáp | Hướng dẫn cách gửi, giải thích quy trình |
| Tin cảnh báo | Tin an ninh trật tự, thủ đoạn lừa đảo mới |
| Nhóm Zalo | Mã QR ở chân trang, bấm được để mở thẳng nhóm |

### Phía cán bộ

| Chức năng | Mô tả |
|---|---|
| Danh sách ý kiến | Lọc theo trạng thái, nhóm, mức khẩn, cán bộ phụ trách; 5 kiểu sắp xếp |
| Hàng chờ kiểm duyệt | Duyệt hoặc đánh dấu tin rác cho tin ẩn danh |
| Phân công, theo dõi hạn | Cảnh báo việc sắp quá hạn và đã quá hạn |
| Chat ẩn danh hai chiều | Hỏi thêm người gửi ẩn danh mà không lộ danh tính |
| Bản đồ điểm nóng | Phân bố vụ việc theo địa bàn |
| Thống kê, báo cáo | Xuất Excel, biểu đồ theo nhóm và theo thời gian |
| Thùng rác | Xoá mềm, giữ 7 ngày, khôi phục được |
| Danh sách chặn | Thiết bị và IP bị khoá, gỡ khoá thủ công |
| Nhật ký thao tác | Ghi lại mọi hành động của cán bộ |
| Gộp sự kiện trùng | Nhiều người cùng báo một vụ việc |
| Mã QR định vị | Dán tại hiện trường hoặc quầy tiếp dân |
| Màn hình kiosk | Đặt máy tại trụ sở cho bà con dùng |

---

## 2. Kiến trúc

```
Trình duyệt (React + TypeScript)
        │  gọi API qua HTTPS
        ▼
Máy chủ Node.js + Express          ─────┬──► MySQL 8 (Aiven)
   · xác thực JWT                       ├──► Brevo        (gửi mã OTP)
   · phân loại bằng bộ từ khoá          ├──► Cloudinary   (lưu ảnh)
   · chặn spam theo thiết bị            ├──► Turnstile    (chống người máy)
   · mã hoá danh tính                   └──► Google Gemini (chỉ trợ lý hỏi đáp)
```

**Frontend** dựng bằng Vite, triển khai trên Netlify.
**Backend** ESM thuần, triển khai trên Render.
Hai bên tách rời hoàn toàn, chỉ nói chuyện qua API.

### Công nghệ

| Lớp | Thành phần |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Trạng thái, dữ liệu | TanStack React Query |
| Giao diện | Framer Motion, Lucide, Recharts, Leaflet |
| Backend | Node.js, Express (ESM), mysql2 |
| Bảo mật | JWT, bcrypt, Helmet, express-rate-limit |
| CSDL | MySQL 8 — 19 bảng |

---

## 3. Phân loại ý kiến — điểm cần nắm để bảo vệ đề tài

**Việc phân loại KHÔNG dùng AI.** Đây là lựa chọn có chủ đích, không phải hạn chế kỹ thuật.

Hệ thống dùng bộ từ khoá song ngữ Việt – Anh: **hơn 2.400 từ khoá, 33 nhóm chủ đề**, đối sánh trên văn bản đã chuẩn hoá dấu và chính tả (`server/src/lib/phan-loai.js`).

Ba lý do:

1. **Ổn định.** Cùng một nội dung luôn cho cùng một nhóm. Mô hình ngôn ngữ có thể trả lời khác nhau giữa hai lần gọi — không chấp nhận được trong quy trình hành chính, vì hai đơn giống nhau phải đi cùng một đường.

2. **Giải thích được.** Hệ thống trả về đúng cụm từ đã khớp (`tuKhoaKhan`), cán bộ đối chiếu được ngay. Mô hình ngôn ngữ đưa ra kết luận mà không nói được vì sao — cán bộ không có căn cứ để phản bác khi thấy sai.

3. **Không gửi dữ liệu ra ngoài.** Nội dung tố giác không rời khỏi hệ thống. Gọi dịch vụ AI để phân loại là gửi nguyên văn tin báo của người dân sang máy chủ bên thứ ba.

**Google Gemini chỉ dùng cho trợ lý hỏi đáp** — hướng dẫn công dân cách gửi ý kiến. Không tham gia phân loại, không đọc nội dung tố giác đã gửi.

---

## 4. Bảo vệ danh tính và chống lạm dụng

### Danh tính người gửi

- Họ tên, số điện thoại, email được **mã hoá** trước khi lưu.
- Gửi ẩn danh thì không lưu gì cả — cán bộ không xem được, kể cả quản trị viên.
- Ẩn danh vẫn liên lạc hai chiều được qua chat có mã PIN, không cần lộ danh tính.

### Chặn spam

Khoá theo **mã thiết bị**, không khoá theo IP.

> Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm thuê bao cùng ra Internet bằng một IP. Khoá IP là khoá oan cả vùng. Bà con ở quê phần lớn vào bằng 4G: đúng nhóm bị chặn oan nhiều nhất, mà cũng đúng nhóm cần kênh tố giác nhất.

| Cơ chế | Chi tiết |
|---|---|
| Chặn ngầm | Thiết bị bị khoá vẫn gửi được, vẫn thấy báo thành công; đơn gắn `is_spam=1`, không vào hàng chờ |
| Khoá thường | 24 giờ |
| Khoá tái phạm | 3 lần tin rác **liên tiếp** trong 30 ngày → khoá 30 ngày |
| Dọn theo lô | Đánh dấu tin rác thì các đơn cùng thiết bị trong 24 giờ trước cũng vào Thùng rác |
| Khoá IP | Chỉ là đường lui khi đơn không có mã thiết bị, thời hạn 2 giờ |

Bốn ràng buộc an toàn được khoá bằng test:

- Khoá **luôn có hạn**, không bao giờ vĩnh viễn — mã thiết bị đổi chủ được (máy tiệm net, điện thoại mượn).
- Tái phạm đếm **liên tiếp** chứ không cộng dồn — xen giữa một đơn được duyệt là chuỗi đứt. Cộng dồn thì người gửi nhiều tin báo thật, lỡ ba tin bị đánh nhầm, cũng mất kênh tố giác.
- Không đếm đơn bị chặn ngầm — đó là máy tự gắn, không phải cán bộ kết luận. Gộp vào thì một lần khoá 24 giờ tự đẻ ra chuỗi ba lần rồi leo lên khoá một tháng mà không ai bấm nút nào.
- Dọn theo lô **không đụng** đơn đang xử lý, đã giải quyết, hoặc đã phân công — đó là những đơn đã có người đọc và quyết định.

---

## 5. Cấu trúc thư mục

```
├── src/                     Frontend
│   ├── components/          Giao diện theo nhóm chức năng
│   ├── pages/               7 trang công dân + 13 trang quản trị
│   ├── services/            Lớp gọi API
│   ├── hooks/               useAdminAuth, ...
│   ├── types/               Kiểu TypeScript dùng chung
│   └── utils/constants.ts   ⭐ CẤU HÌNH ĐƠN VỊ
│
├── server/                  Backend
│   └── src/
│       ├── routes/          7 route công khai + 12 route quản trị
│       ├── lib/             phan-loai.js, chan-spam.js, crypto.js, ...
│       └── lib/unit.js      ⭐ CẤU HÌNH ĐƠN VỊ (phía máy chủ)
│
├── database/                Toàn bộ tệp SQL
├── docs/                    Tài liệu
└── public/media/            Ảnh, mã QR Zalo
```

---

## 6. Chạy trên máy

```cmd
npm install
copy .env.example .env
npm run dev
```

```cmd
cd server
npm install
copy .env.example .env
npm run dev
```

Điền `server/.env` các biến bắt buộc: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`.

Tuỳ chọn: `GEMINI_API_KEY` (trợ lý), `TURNSTILE_SECRET_KEY` (chống người máy), `CORS_ORIGIN`.

Phía frontend: `VITE_API_URL`, `VITE_TURNSTILE_SITE_KEY`, `VITE_CLOUDINARY_*`.

> ⚠️ `VITE_TURNSTILE_SITE_KEY` và `TURNSTILE_SECRET_KEY` phải khai **cùng lúc**. Khai một nửa thì xác minh luôn thất bại, và ô xác minh không hiện ra được — cán bộ sai mật khẩu 3 lần sẽ mắc kẹt cho tới khi hết giờ đếm lùi.

---

## 7. Kiểm tra trước khi giao

```cmd
npx tsc --noEmit
cd server && node --test tests/*.test.js
```

Cả hai phải sạch. Bộ kiểm thử hiện có **310 trường hợp**.

Các test không chỉ kiểm logic máy chủ mà còn **đọc thẳng mã nguồn hai phía** để bắt loại lỗi "máy chủ đúng, giao diện đúng, chỗ nối giữa sai" — kiểu hỏng không lộ ra ở test chỉ kiểm một phía. Đây là bài học từ ô sắp xếp: máy chủ nhận đủ tham số, giao diện có ô chọn, nhưng lời gọi API quên kèm `sort`, nên đổi ô xong thứ tự vẫn y nguyên.

---

## 8. Triển khai

1. Đẩy mã lên GitHub → Render tự dựng lại backend, Netlify tự dựng lại frontend.
2. **Đợi Render xong** rồi mới kiểm tra, nếu lần đó có sửa phía máy chủ.
3. Thay đổi cấu trúc CSDL **không** tự chạy theo mã nguồn — phải chạy tệp SQL tương ứng bằng tay.

> Trình duyệt có thể giữ bản cũ trong bộ nhớ đệm. Kiểm tra mà thấy chưa đổi: mở DevTools → Application → Service Workers → Unregister, rồi Clear site data.

---

## 9. Tài liệu liên quan

| Tệp | Nội dung |
|---|---|
| `docs/4_CAM_NANG_DOI_DON_VI.md` | Chuyển hệ thống sang đơn vị Công an khác |
| `docs/CHANGELOG-BAO-MAT.md` | Nhật ký các bản vá bảo mật |
| `docs/adr/` | Các quyết định kiến trúc và lý do |
| `README.md` | Hướng dẫn cài đặt nhanh |
