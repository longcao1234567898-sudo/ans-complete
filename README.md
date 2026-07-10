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

Hệ thống tự chọn "bộ não" theo thứ tự: **ChatGPT → Gemini → câu trả lời mẫu**. Chỉ cần điền 1 key:

**Cách 1 — Google Gemini (khuyên dùng, có gói miễn phí):**
1. Vào https://aistudio.google.com/app/apikey, đăng nhập Gmail
2. Bấm **Create API key**, copy key
3. Sao chép `.env.example` thành `.env`, dán vào dòng `VITE_GEMINI_API_KEY=...`
4. Khởi động lại `npm run dev`

**Cách 2 — ChatGPT (OpenAI, cần tài khoản có credit trả phí):**
- Lấy key tại https://platform.openai.com/api-keys, dán vào `VITE_OPENAI_API_KEY=...` trong `.env`

Không có key, trợ lý AI vẫn hoạt động với bộ câu trả lời mẫu tại `src/utils/mockData.ts`. Khi AI thật đang bật, header cửa sổ chat hiển thị nhãn **ChatGPT** hoặc **Gemini** kèm chấm xanh.

⚠️ **Bảo mật**: key đặt ở frontend sẽ lộ cho người xem mã nguồn khi web lên mạng — chỉ phù hợp demo/học tập trên máy cá nhân. Triển khai thật cần backend trung gian giữ key.

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
- **Vercel + GitHub (tự động):** đẩy code lên GitHub → import vào vercel.com → thêm biến môi trường `VITE_GEMINI_API_KEY` → Deploy. File `vercel.json` đã cấu hình sẵn.
- ⚠️ Key AI nằm trong bản build sẽ **công khai cho mọi người xem được** — chỉ dùng key miễn phí, sẵn sàng thu hồi sau demo.

## Database (MySQL/MariaDB)
File `database/hop_thu_an_ninh_so.sql` chứa schema hoàn chỉnh: 9 bảng, trigger, function sinh mã tra cứu, procedure cập nhật trạng thái/tra cứu/chống spam, 3 view thống kê, kèm dữ liệu demo DEMO01–DEMO04. Import bằng phpMyAdmin/MySQL Workbench hoặc: `mysql -u root -p < database/hop_thu_an_ninh_so.sql`. Lưu ý: đổi password_hash tài khoản admin bằng bcrypt trước khi dùng thật. Web hiện vẫn chạy localStorage — database này dùng khi xây backend API.
