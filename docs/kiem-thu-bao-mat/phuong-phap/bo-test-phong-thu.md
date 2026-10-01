# Phụ lục C — Bộ test phòng thủ: xác nhận giới hạn không bị lách

> **Đóng khung rõ ràng:** toàn bộ test trong phụ lục này là **kiểm thử phòng thủ trên hệ
> thống của chính mình**. Mục đích là *xác nhận giới hạn giữ đúng ngưỡng*, không phải để
> khai thác. Test khẳng định điều kiện **"phải bị chặn"** — nếu không bị chặn thì test đỏ.
>
> **Quy tắc chạy — không được vi phạm:**
> - Chỉ chạy trên `localhost` hoặc môi trường staging riêng, **không bao giờ** trên production đang phục vụ dân.
> - Chỉ dùng dữ liệu giả, tài khoản test, email test. Không dùng dữ liệu tố giác thật.
> - Không chạy test tải nặng vào endpoint gọi Gemini/Cloudinary/Brevo — sẽ đốt quota và tiền thật của bên thứ ba. Stub các lớp đó lại.
> - Đặt file trong `server/tests/`, chạy bằng `node --test` như phần còn lại của dự án.

---

## 1. Khung test đua tranh (race-condition) dùng chung

Ý tưởng: bắn N request **song song thật sự** (`Promise.all`, không tuần tự) rồi đếm số
request thành công. Đếm được nhiều hơn ngưỡng nghĩa là đường "đọc–kiểm–ghi" không atomic.

```js
// server/tests/_khung-dua-tranh.js
/**
 * Bắn N yêu cầu song song vào cùng một hành động, trả về thống kê mã trạng thái.
 * Dùng để XÁC NHẬN giới hạn giữ đúng ngưỡng khi có nhiều yêu cầu cùng lúc.
 */
export async function banSongSong(taoYeuCau, soLan) {
  const ketQua = await Promise.all(
    Array.from({ length: soLan }, (_, i) =>
      taoYeuCau(i).then(
        (r) => r.status,
        () => 0 // lỗi mạng/ngoại lệ đếm riêng
      )
    )
  );
  return ketQua.reduce((thongKe, ma) => {
    thongKe[ma] = (thongKe[ma] || 0) + 1;
    return thongKe;
  }, {});
}
```

## 2. Danh sách test bắt buộc

Mỗi dòng là một test phải tồn tại và phải **xanh** trước khi đóng Giai đoạn 4.

### 2.1 Giới hạn đếm — phải atomic

| Test | Hành động | Kỳ vọng (khẳng định phòng thủ) |
|---|---|---|
| `khieu-nai-dua-tranh.test.js` | 20 × `POST /api/khieu-nai` song song, cùng hồ sơ | Đúng **2** bản ghi trong DB; các request còn lại bị từ chối |
| `otp-dua-tranh.test.js` | 20 × `POST /api/otp/send` song song, cùng email | Đúng **5** mã được phát trong 1 giờ |
| `otp-doan-ma.test.js` | 10 lần `POST /api/otp/verify` sai liên tiếp | Mã bị huỷ sau lần thứ **5**; lần thứ 6 không bao giờ đúng kể cả khi đoán trúng số |
| `anon-code-dua-tranh.test.js` | Bắn song song `POST /api/otp/anon-code` | Có ngưỡng rõ ràng; mã của người này **không** làm mất hiệu lực mã của người kia *(lỗi từng xảy ra — xem `lib/chan-spam.js`)* |
| `trash-xoa-va-khoi-phuc.test.js` | `restore` và `DELETE` song song trên cùng bản ghi | Không sinh trạng thái nửa vời; một trong hai thất bại sạch sẽ |

### 2.2 Rate limit — phải giữ đúng ngưỡng

| Test | Hành động | Kỳ vọng |
|---|---|---|
| `rate-limit-tracking.test.js` | 100 × `GET /api/tracking/:code` song song | ≤ **30** mã 200, phần còn lại **429** |
| `rate-limit-dang-nhap.test.js` | 20 × `POST /api/auth/login` sai mật khẩu | ≤ **5** lần được xử lý, sau đó 429 |
| `rate-limit-ai.test.js` | 60 × `POST /api/ai/chat` (lớp AI đã stub) | ≤ **30** trong cửa sổ 5 phút |
| `rate-limit-header-gia.test.js` | Gửi kèm `X-Forwarded-For` tự đặt, đổi giá trị mỗi request | **Vẫn bị chặn** — không được reset bộ đếm theo header client tự khai |

### 2.3 Kiểm ở backend, không chỉ frontend

| Test | Hành động (bỏ qua hoàn toàn giao diện, gọi thẳng API) | Kỳ vọng |
|---|---|---|
| `backend-do-dai-noi-dung.test.js` | `POST /api/submissions` với nội dung 50.000 ký tự | Bị cắt còn 2000 hoặc từ chối — **không** lưu nguyên |
| `backend-so-anh.test.js` | Gửi 10 ảnh trong một đơn | Chỉ **3** ảnh được lưu |
| `backend-kich-thuoc-anh.test.js` | Gửi ảnh 20 MB, thử **cả** nhánh Cloudinary lẫn nhánh base64 | Bị từ chối ở cả hai nhánh |
| `backend-loai-file.test.js` | Gửi file `.php`/`.svg` đặt tên `.jpg`, `Content-Type: image/jpeg` | Bị từ chối theo **magic bytes**, không tin phần mở rộng |
| `backend-tu-cam.test.js` | Nội dung chứa từ cấm, gửi thẳng qua `curl` | Backend chặn dù frontend không chặn |
| `backend-captcha.test.js` | Gửi đơn **không** kèm token Turnstile khi đã bật CAPTCHA | Bị từ chối (fail-closed, không fail-open) |

### 2.4 Chống đổi tham số

| Test | Hành động | Kỳ vọng |
|---|---|---|
| `tham-so-mass-assignment.test.js` | `POST /api/submissions` kèm `{ is_spam: 0, status: 'resolved', assigned_to: 1, id: 999 }` | Các trường này bị **bỏ qua hoàn toàn**, không ghi vào DB |
| `tham-so-an-danh.test.js` | `is_anonymous: true` nhưng vẫn gửi kèm tên/SĐT | Danh tính **không** được lưu, hoặc đơn bị từ chối — không có trạng thái "ẩn danh nhưng vẫn lưu danh tính" |
| `tham-so-vai-tro.test.js` | Token cán bộ thường, gửi body `{ role: 'admin' }` | Vai trò lấy **từ token đã ký**, không lấy từ body |
| `tham-so-thiet-bi.test.js` | Đang bị shadow-ban, đổi `deviceId` sang UUID mới | Đơn vẫn gửi được (đúng thiết kế) nhưng **lớp IP** phải kích hoạt sau ngưỡng 3 đơn/3 thiết bị/1 giờ |

### 2.5 Phân quyền — bộ test IDOR

| Test | Hành động | Kỳ vọng |
|---|---|---|
| `idor-xem-ho-so.test.js` | Cán bộ A gọi `GET /api/admin/submissions/:id` của hồ sơ giao cho B | Theo ma trận quyền đã chốt ở GĐ2 §2.1 — và **hành vi phải giống nhau** với mọi `id`, không lộ sự tồn tại của hồ sơ qua chênh lệch 403/404 |
| `idor-reveal.test.js` | Cán bộ **không** được phân công gọi `POST /:id/reveal` | **403**, và lượt thử này vẫn phải vào nhật ký |
| `idor-tu-phan-cong.test.js` | Cán bộ tự gọi `PATCH /:id/assign` gán cho chính mình → rồi `POST /:id/reveal` | Chuỗi này phải bị chặn ở bước `assign` |
| `idor-ha-muc-mat.test.js` | Cán bộ gọi `PATCH /:id/security-level` hạ mức | Bị chặn nếu không đủ quyền |
| `idor-chat.test.js` | Đổi tham số định danh ở `GET /api/chat/messages` | Không đọc được hội thoại của hồ sơ khác |
| `idor-xoa-du-lieu.test.js` | `POST /api/tracking/:code/request-deletion` với mã của người khác | Phải có bước xác thực chủ sở hữu, không chỉ biết mã là xoá được |
| `admin-thieu-authorize.test.js` | Duyệt **tất cả** route dưới `/api/admin`, gọi bằng token vai trò thấp nhất | Mọi route trả 403 trừ những route **cố ý** cho phép — danh sách cho phép viết thẳng trong test |

> Test cuối cùng (`admin-thieu-authorize.test.js`) là test giá trị nhất cả bộ: nó biến ma trận
> phân quyền thành thứ chạy được. Route mới thêm sau này mà quên `authorize()` sẽ làm test đỏ ngay.

### 2.6 Chống rò rỉ dữ liệu

| Test | Hành động | Kỳ vọng |
|---|---|---|
| `khong-ro-ri-loi.test.js` | Ép lỗi 500 với `NODE_ENV=production` | Response **không** chứa stack trace, tên bảng, câu SQL |
| `khong-ro-ri-danh-tinh.test.js` | `GET /api/admin/submissions` với vai trò cán bộ thường | Response không chứa `sender_phone`/`sender_name` kể cả dạng đã mã hoá |
| `khong-ro-ri-log.test.js` | Gửi một đơn có danh tính, bắt `console.log` trong test | Không có SĐT, email, token, mật khẩu trong log |
| `health-chan-doan-kin.test.js` | Gọi các endpoint chẩn đoán không kèm token với `NODE_ENV=production` | 401/403 hoặc 404 — không trả thông tin cấu trúc lưu trữ |

## 3. Bảng theo dõi tiến độ bộ test

| # | File test | Đã viết | Xanh | Ghi chú |
|---|---|---|---|---|
| 1 | `khieu-nai-dua-tranh.test.js` | ☐ | ☐ | |
| 2 | `otp-dua-tranh.test.js` | ☐ | ☐ | |
| 3 | `otp-doan-ma.test.js` | ☐ | ☐ | |
| 4 | `anon-code-dua-tranh.test.js` | ☐ | ☐ | |
| 5 | `trash-xoa-va-khoi-phuc.test.js` | ☐ | ☐ | |
| 6 | `rate-limit-tracking.test.js` | ☐ | ☐ | |
| 7 | `rate-limit-dang-nhap.test.js` | ☐ | ☐ | |
| 8 | `rate-limit-ai.test.js` | ☐ | ☐ | |
| 9 | `rate-limit-header-gia.test.js` | ☐ | ☐ | |
| 10 | `backend-do-dai-noi-dung.test.js` | ☐ | ☐ | |
| 11 | `backend-so-anh.test.js` | ☐ | ☐ | |
| 12 | `backend-kich-thuoc-anh.test.js` | ☐ | ☐ | |
| 13 | `backend-loai-file.test.js` | ☐ | ☐ | |
| 14 | `backend-tu-cam.test.js` | ☐ | ☐ | |
| 15 | `backend-captcha.test.js` | ☐ | ☐ | |
| 16 | `tham-so-mass-assignment.test.js` | ☐ | ☐ | |
| 17 | `tham-so-an-danh.test.js` | ☐ | ☐ | |
| 18 | `tham-so-vai-tro.test.js` | ☐ | ☐ | |
| 19 | `tham-so-thiet-bi.test.js` | ☐ | ☐ | |
| 20 | `idor-xem-ho-so.test.js` | ☐ | ☐ | |
| 21 | `idor-reveal.test.js` | ☐ | ☐ | |
| 22 | `idor-tu-phan-cong.test.js` | ☐ | ☐ | |
| 23 | `idor-ha-muc-mat.test.js` | ☐ | ☐ | |
| 24 | `idor-chat.test.js` | ☐ | ☐ | |
| 25 | `idor-xoa-du-lieu.test.js` | ☐ | ☐ | |
| 26 | `admin-thieu-authorize.test.js` | ☐ | ☐ | |
| 27 | `khong-ro-ri-loi.test.js` | ☐ | ☐ | |
| 28 | `khong-ro-ri-danh-tinh.test.js` | ☐ | ☐ | |
| 29 | `khong-ro-ri-log.test.js` | ☐ | ☐ | |
| 30 | `health-schema-kin.test.js` | ☐ | ☐ | |

> Dự án đã có 285 test đang chạy không cần MySQL (`cd server && npm test`). Giữ nguyên tính
> chất đó: test nào cần DB thì dùng lớp giả lập, để bộ test vẫn chạy được trên máy bất kỳ và
> trong CI — bộ test chỉ chạy được trên một máy là bộ test sẽ chết dần.
