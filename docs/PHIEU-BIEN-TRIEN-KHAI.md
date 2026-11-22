# Phiếu biến triển khai — máy chủ Viettel CS1, kho vDBS, sao lưu Bizfly

**Mọi thứ phải đặt khi dựng hệ thống, gom vào một chỗ** — để khi làm không sót dòng nào. Danh sách
biến lấy từ chính mã nguồn (những gì máy chủ thật sự đọc), không chép theo trí nhớ; test
`server/tests/so-tay-trien-khai.test.js` báo đỏ nếu mã đọc thêm biến mà phiếu chưa ghi.

Đi kèm [KICH-BAN-DONG-HANH-TRIEN-KHAI.md](KICH-BAN-DONG-HANH-TRIEN-KHAI.md): cột **GĐ** là giai
đoạn điền (1 chuẩn bị · 3 tệp cấu hình · 4 giao diện · 6 mở kho · 7 ngày bật).

---

## ⚠️ Đọc trước: ghi vào đâu

| Loại | Cột **Bí mật** | Ghi vào **note** (điện thoại, máy tính) được không |
|---|---|---|
| Tên, địa chỉ, cổng, tên gói, cài đặt | `—` | **Được.** Chép phiếu này ra note, điền vào cột "Giá trị" |
| Khoá, mật khẩu | **🔒** | **Không.** Note trên điện thoại/máy tính bị đồng bộ lên mạng, bị xem trộm khi mượn máy. Ghi **trên giấy + 2 USB** cất tủ có khoá. Trong note chỉ đánh dấu ☑ *"đã ghi giấy"* |

**Không bao giờ** dán phiếu đã điền vào GitHub, email, Zalo, hay gửi cho Claude. Bản trong kho mã
nguồn này luôn là **bản trống**.

---

## 1. Thông tin hạ tầng (không phải biến, nhưng cả phiếu dùng tới)

| Tên | GĐ | Lấy ở đâu | Bí mật | Giá trị |
|---|---|---|---|---|
| Tên miền gốc (`ten-mien.vn`) | 1 | Trang mua tên miền | — | |
| DNS **cũ** của `@` | 1 | Trang quản lý DNS, **trước khi đổi** — đường lùi ngày bật | — | |
| DNS **cũ** của `www` | 1 | Như trên | — | |
| `IP-MAY-VIETTEL` — địa chỉ **công khai** CS1 | 1 | Trang quản trị máy CS1 | — | |
| `IP-MAY-CHU` — địa chỉ **riêng** CS1 trong VPC | 1 | Trang quản trị CS1, hoặc `hostname -I` | — | |
| Khu vực + tên VPC/subnet của CS1 | 1 | Trang quản trị CS1 | — | |
| Mật khẩu root máy CS1 | 1 | Viettel gửi khi tạo máy (sau chặng 3 chỉ dùng lúc vào bằng Console) | 🔒 | ☐ đã ghi giấy |
| Khoá SSH riêng trên máy Windows (`~/.ssh/...` không có đuôi `.pub`) | 2 | Tạo ở B3 | 🔒 | ☐ có bản dự phòng trên USB |
| `DIA-CHI-KHO` — tên máy riêng của kho | 6 | Trang quản trị vDBS (kho mã hoá: **tên trên chứng chỉ**, C2 Kiểm 1b) | — | |
| `CONG-KHO` | 6 | Trang quản trị vDBS (thường `3306`) | — | |
| Mật khẩu root kho vDBS (chỉ chữ và số) | 6 | Tự đặt khi tạo kho | 🔒 | ☐ đã ghi giấy |
| Kho có mã hoá? → dòng `KHO_TLS=…` phải gõ | 6 | C2 Kiểm 1 | — | ☐ Có `KHO_TLS="--ssl-ca=/etc/hop-thu/ca-db.pem --ssl-mode=VERIFY_IDENTITY"` · ☐ Không `KHO_TLS=""` |
| Kho Aiven cũ: `HOST-AIVEN`, `PORT-AIVEN` | 1 | Render Environment / Aiven Console | — | |
| Mật khẩu `avnadmin` của Aiven | 1 | Render Environment (`DB_PASSWORD` cũ) | 🔒 | ☐ đã ghi giấy |

### Bản ghi DNS

| Tên | Loại | Trỏ về | GĐ | Ghi chú |
|---|---|---|---|---|
| `api` | A | `IP-MAY-VIETTEL` | 1 | **Không** bật đám mây cam Cloudflare |
| `canbo-api` | A | `IP-MAY-VIETTEL` | 1 | Như trên |
| `@` | A | `IP-MAY-VIETTEL` | **7** | Chỉ đổi ở ngày bật |
| `www` | A | `IP-MAY-VIETTEL` | **7** | Chỉ đổi ở ngày bật |

---

## 2. Máy chủ người dân — `/etc/hop-thu/cong-khai.env`

| Biến | GĐ | Ghi gì / lấy ở đâu | Bí mật | Phải khớp với |
|---|---|---|---|---|
| `PORT` | 3 | `4000` | — | Nginx B9 (`upstream hop_thu_cong_khai`) |
| `HOST` | 3 | `127.0.0.1` — **không đổi** | — | `can-bo.env` |
| `DB_HOST` | **6** | `DIA-CHI-KHO` (GĐ3 để trống) | — | `can-bo.env`, `host=` trong `sao-luu.cnf` |
| `DB_PORT` | **6** | `CONG-KHO` (GĐ3 để trống) | — | `can-bo.env`, `port=` trong `sao-luu.cnf` |
| `DB_USER` | 3 | `hop_thu_ung_dung` — **không** dùng root | — | `can-bo.env` |
| `DB_PASSWORD` | **6** | Mật khẩu tài khoản `hop_thu_ung_dung` (mục 5) | 🔒 | `can-bo.env` |
| `DB_NAME` | 3 | `hop_thu_an_ninh_so` | — | `can-bo.env`, `sao-luu.env` |
| `DB_SSL_CA` | **6** | `/etc/hop-thu/ca-db.pem` — **chỉ khi** kho có mã hoá. Chưa có tệp CA thì **không ghi dòng này** (máy chủ không lên) | — | `ssl-ca=` trong `sao-luu.cnf` |
| `JWT_SECRET` | 3 | **Chép y nguyên từ Render** | 🔒 | `can-bo.env` + Render |
| `ENCRYPTION_KEY` | 3 | **Chép y nguyên từ Render.** Sai một ký tự là **mất vĩnh viễn** danh tính đã lưu | 🔒 | `can-bo.env` + Render |
| `HASH_PEPPER` | 3 | **Chép y nguyên từ Render** | 🔒 | `can-bo.env` + Render |
| `CORS_ORIGIN` | 3 | `https://www.ten-mien.vn` (không có `/` cuối) | — | `can-bo.env` |
| `CLIENT_URL` | 3 | `https://www.ten-mien.vn` | — | |
| `TURNSTILE_SECRET_KEY` | 3 | Render (hoặc Cloudflare → Turnstile → site → Settings) | 🔒 | `can-bo.env`; **cùng site** với `VITE_TURNSTILE_SITE_KEY` (mục 4) |
| `GEMINI_API_KEY` | 3 | Render. Để trống = tắt trợ lý hỏi đáp | 🔒 | |
| `GEMINI_MODEL` | 3 | Render | — | |
| `GEMINI_CHAT_MODEL` | 3 | Render | — | |
| `BREVO_API_KEY` | 3 | Render — gửi email mã xác thực | 🔒 | |
| `MAIL_USER` | 3 | Render — địa chỉ người gửi email | — | |
| `BAT_XAC_THUC_EMAIL` | 3 | `false` (như B7) | — | |
| `CLOUDINARY_CLOUD_NAME` | 3 | Render | — | `VITE_CLOUDINARY_CLOUD_NAME` |
| `CLOUDINARY_API_KEY` | 3 | Render | 🔒 | `can-bo.env` |
| `CLOUDINARY_API_SECRET` | 3 | Render | 🔒 | `can-bo.env` |
| `TRICH_CHU_OCR` | 3 | Để trống (máy 4 GB). Máy 2 GB: `tat` | — | `can-bo.env` |

**Tuỳ chọn — chỉ ghi khi bật tính năng đó:**

| Biến | Dùng khi | Bí mật |
|---|---|---|
| `GEMINI_FALLBACK_MODEL` | Muốn đổi model dự phòng của trợ lý | — |
| `KENH_XAC_MINH_SDT` | Bật mã xác minh số điện thoại (B9c). Để trống = tắt | — |
| `ESMS_API_KEY`, `ESMS_SECRET_KEY` | Đi kèm `KENH_XAC_MINH_SDT` (B9c) | 🔒 |
| `ESMS_ZALO_OAID`, `ESMS_ZALO_TEMPID` | Kênh Zalo của B9c | — |
| `ESMS_BRANDNAME` | Kênh SMS của B9c | — |
| `ESMS_SANDBOX` | `1` khi thử B9c (không gửi tin thật) — **bỏ** khi chạy thật | — |
| `RESEND_API_KEY`, `MAIL_FROM` | Thay Brevo bằng Resend | 🔒 (khoá) |
| `MAIL_PASS` | Thay Brevo bằng Gmail (App Password) | 🔒 |

**Không ghi trên máy Viettel** (chỉ dành cho Render hoặc lúc thử): `GIU_THUC`, `GIU_THUC_URL`,
`RENDER_EXTERNAL_URL` (giữ máy Render khỏi ngủ — Viettel không ngủ), `DB_SSL`, `DB_SSL_CA_PEM`
(cách khai TLS khác — trên Viettel dùng `DB_SSL_CA`), `TMPDIR` (systemd tự lo bằng `PrivateTmp`).
`NODE_ENV` (giá trị `production`) đã nằm trong tệp systemd (B8), không ghi vào `.env`.

---

## 3. Máy chủ cán bộ — `/etc/hop-thu/can-bo.env`

| Biến | GĐ | Ghi gì | Bí mật | Phải khớp với |
|---|---|---|---|---|
| `ADMIN_PORT` | 3 | `4001` | — | Nginx B9 (`upstream hop_thu_can_bo`) |
| `HOST` | 3 | `127.0.0.1` — **không đổi** (chốt chặn lách chặn IP, BUG-047) | — | `cong-khai.env` |
| `DB_HOST`, `DB_PORT`, `DB_PASSWORD` | **6** | **Giống hệt** `cong-khai.env` | 🔒 (mật khẩu) | `cong-khai.env` |
| `DB_USER`, `DB_NAME` | 3 | **Giống hệt** `cong-khai.env` | — | `cong-khai.env` |
| `DB_SSL_CA` | **6** | Như `cong-khai.env` (chỉ khi kho mã hoá) | — | `cong-khai.env` |
| `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` | 3 | **Giống hệt** `cong-khai.env` | 🔒 | `cong-khai.env` + Render |
| `CORS_ORIGIN` | 3 | `https://www.ten-mien.vn` | — | `cong-khai.env` |
| `ADMIN_CORS_ORIGIN` | 3 | Để trống (chỉ khi trang cán bộ có địa chỉ riêng trong mạng nội bộ) | — | |
| `ADMIN_ALLOWED_IPS` | 3 | IP tĩnh của cơ quan, cách nhau dấu phẩy. Chưa có thì để trống | — | Quyết định câu 3 trong kịch bản |
| `TURNSTILE_SECRET_KEY` | 3 | **Giống hệt** `cong-khai.env`. Thiếu là máy dò được mật khẩu cán bộ (BUG-044) | 🔒 | `cong-khai.env` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | 3 | Như `cong-khai.env` | 🔒 (2 khoá) | `cong-khai.env` |
| `TRICH_CHU_OCR` | 3 | Như `cong-khai.env` | — | `cong-khai.env` |

Kiểm hai tệp khớp nhau **mà không in khoá**: lệnh so `GIỐNG/KHÁC` ở giai đoạn 3 của kịch bản.

---

## 4. Giao diện — `/etc/hop-thu/giao-dien.env` (F3)

⚠️ Mọi biến `VITE_*` bị nhúng vào JavaScript công khai — **không bao giờ** đặt khoá bí mật ở đây.

| Biến | GĐ | Ghi gì | Bí mật |
|---|---|---|---|
| `VITE_API_URL` | 4 | `https://api.ten-mien.vn` (chữ thường, không `/` cuối) | — công khai |
| `VITE_ADMIN_API_URL` | 4 | `https://canbo-api.ten-mien.vn` | — công khai |
| `VITE_TURNSTILE_SITE_KEY` | — | **Không cần ghi**: lấy từ `.env.production` trong mã nguồn. Phải **cùng site Cloudflare** với `TURNSTILE_SECRET_KEY` | — công khai |
| `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_PRESET` | — | **Không cần ghi** (như trên) | — công khai |

**Cloudflare Turnstile → site → Hostname Management** (GĐ7, F6): thêm `www.ten-mien.vn`.

---

## 5. Kho dữ liệu Viettel vDBS (GĐ6)

**Cài đặt trên trang quản trị vDBS:**

| Mục | Đặt | Ghi chú |
|---|---|---|
| Gói | T2.VDBS 1 Standalone | |
| Phiên bản | MySQL 8.0 | |
| Kiểu truy cập | Private Access, **cùng khu vực và VPC** với CS1 | |
| Actions → Connect To Other Subnet | Subnet của CS1 | Không làm là máy chủ không nối được |
| Sao lưu tự động | Hằng ngày, 01:00, giữ 14 bản | |
| Tham số `log_bin_trust_function_creators` | `1` | Thiếu thì không nhập được dữ liệu cũ (`ERROR 1419`) |
| Tham số `sql_require_primary_key` | Tắt (`0`) nếu đang bật | |

**Tài khoản trong kho** (tạo bằng root kho):

| Tài khoản | Gắn với máy | Quyền | Dùng ở | Bí mật | Giá trị |
|---|---|---|---|---|---|
| `root` | — | Toàn quyền | Chỉ cho C2–C4 (tạo tài khoản, chép dữ liệu, nâng cấp) | 🔒 | ☐ đã ghi giấy |
| `hop_thu_ung_dung` | `IP-MAY-CHU` (không dùng `%`) | `SELECT, INSERT, UPDATE, DELETE, EXECUTE` trên `hop_thu_an_ninh_so.*` | `DB_PASSWORD` hai tệp `.env` | 🔒 | ☐ đã ghi giấy |
| `sao_luu` | `IP-MAY-CHU` (không dùng `%`) | `SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT` trên `hop_thu_an_ninh_so.*` + `SHOW_ROUTINE ON *.*` | `password=` trong `sao-luu.cnf` | 🔒 | ☐ đã ghi giấy |

**Cơ sở dữ liệu:** tên `hop_thu_an_ninh_so`, bảng mã `utf8mb4` / `utf8mb4_unicode_ci` (C3 bước 5b).

**Tệp chứng chỉ CA** (chỉ khi kho mã hoá): Viettel cấp → dán vào `/etc/hop-thu/ca-db.pem`, quyền `644`.

---

## 6. Sao lưu Bizfly (GĐ6)

**Trên Bizfly:**

| Tên | Lấy ở đâu | Bí mật | Giá trị |
|---|---|---|---|
| Thành phố của bucket | Chọn **khác** thành phố của CS1 | — | |
| Tên bucket (vd `hop-thu-sao-luu`), chế độ **riêng tư** | Tự đặt | — | |
| Endpoint S3 của vùng | Trang Bizfly ghi sẵn | — | |
| Access Key | Tạo ở G2 bước 1 | 🔒 | ☐ đã ghi giấy |
| Secret Key | Như trên | 🔒 | ☐ đã ghi giấy |

**Trên máy tính cơ quan** (không phải máy Viettel):

| Tên | Bí mật | Giá trị |
|---|---|---|
| Khoá công khai `age1…` (in ra khi chạy `age-keygen`) | — công khai | |
| Tệp khoá mở `khoa-sao-luu.txt` | 🔒 | ☐ đã chép ra 2 USB · ☐ đã xoá khỏi máy tính |

**Trên máy CS1 — ba tệp:**

`/etc/hop-thu/sao-luu.cnf` (quyền chỉ cho tài khoản `hopthu-sl` đọc — G2):

| Dòng | Ghi gì | Phải khớp với |
|---|---|---|
| `[client]` | Giữ nguyên | |
| `user` | `sao_luu` | Mục 5 |
| `password` | Mật khẩu `sao_luu` 🔒 | Mục 5 |
| `host` | `DIA-CHI-KHO` | `DB_HOST` |
| `port` | `CONG-KHO` | `DB_PORT` |
| `ssl-ca` | `/etc/hop-thu/ca-db.pem` — kho **không** mã hoá thì **xoá dòng** | `DB_SSL_CA` |
| `ssl-mode` | `VERIFY_IDENTITY` — kho **không** mã hoá thì **xoá dòng** | |

`/etc/hop-thu/sao-luu.env`:

| Biến | Ghi gì | Phải khớp với |
|---|---|---|
| `DB_NAME` | `hop_thu_an_ninh_so` | `.env` |
| `SAO_LUU_CNF` | `/etc/hop-thu/sao-luu.cnf` | |
| `AGE_RECIPIENT` | Khoá công khai `age1…` | Đi cặp với `khoa-sao-luu.txt` |
| `RCLONE_DICH` | `bizfly:TEN-BUCKET` | Tên `[bizfly]` trong `rclone.conf` + tên bucket |

`/etc/hop-thu/rclone.conf` (mục `[bizfly]`):

| Dòng | Ghi gì | Bí mật |
|---|---|---|
| `type` | `s3` | — |
| `provider` | `Other` | — |
| `access_key_id` | Access Key Bizfly | 🔒 |
| `secret_access_key` | Secret Key Bizfly | 🔒 |
| `endpoint` | Endpoint S3 của vùng | — |
| `acl` | `private` | — |

Tệp hẹn giờ (G4) đã có sẵn `RCLONE_CONFIG=/etc/hop-thu/rclone.conf` và giờ chạy `02:30 Asia/Ho_Chi_Minh` — không phải điền.

---

## 7. Mười chỗ phải khớp nhau — sai một chỗ là hỏng âm thầm

| # | Cái này | Phải giống | Sai thì |
|---|---|---|---|
| 1 | Ba khoá ở `cong-khai.env` | Ba khoá ở `can-bo.env` **và** ở Render | Cán bộ không xem được danh tính; `ENCRYPTION_KEY` sai là mất vĩnh viễn |
| 2 | `TURNSTILE_SECRET_KEY` | Có ở **cả hai** tệp, cùng site với `VITE_TURNSTILE_SITE_KEY` | Không ai gửi được ý kiến, hoặc máy dò được mật khẩu cán bộ |
| 3 | `DB_*` ở `cong-khai.env` | `DB_*` ở `can-bo.env` | Một máy chủ chạy, một máy không |
| 4 | `DB_PASSWORD` | Mật khẩu `hop_thu_ung_dung` trong kho | `Access denied` |
| 5 | Địa chỉ gắn tài khoản kho | Địa chỉ kho thấy (câu báo lỗi `…@'10.x.x.x'` in đúng địa chỉ này) | `Access denied` |
| 6 | `DB_HOST` (kho mã hoá) | Tên ghi trên chứng chỉ của kho (C2 Kiểm 1b), không phải IP | Máy chủ từ chối nối (cố ý — BUG-033) |
| 7 | `DB_SSL_CA` có / không | Kết quả C2 Kiểm 1; có thì tệp CA phải có thật | Máy chủ không lên |
| 8 | `host`, `port`, `ssl-*` trong `sao-luu.cnf` | `DB_HOST`, `DB_PORT`, `DB_SSL_CA` | Sao lưu báo `LOI` |
| 9 | `AGE_RECIPIENT` | Khoá công khai đi cặp với `khoa-sao-luu.txt` trên USB | Có bản sao mà **không mở được** |
| 10 | `CORS_ORIGIN` / `VITE_API_URL` | Đúng tên miền thật, `https://`, chữ thường, không `/` cuối | Trang báo lỗi CORS, không gửi được |

---

## 8. Bảng đánh dấu nhanh — dán vào note

Chép khối dưới vào note điện thoại/máy tính, đánh dấu khi xong. **Không** điền khoá, mật khẩu.

```
PHIẾU BIẾN TRIỂN KHAI — ngày bắt đầu: ........
[GĐ1] Hạ tầng
 [ ] Tên miền: ............   [ ] DNS cũ @: ........  www: ........
 [ ] IP công khai CS1: ............   [ ] IP riêng CS1: ............
 [ ] Khu vực/VPC: ............
 [ ] DNS api + canbo-api -> IP công khai (không đám mây cam)
 [ ] Giấy+USB: 3 khoá, Turnstile, Gemini, Brevo, Cloudinary, mật khẩu root CS1, Aiven
[GĐ3] cong-khai.env + can-bo.env
 [ ] PORT=4000 / ADMIN_PORT=4001     [ ] HOST=127.0.0.1 (cả hai)
 [ ] DB_USER=hop_thu_ung_dung  DB_NAME=hop_thu_an_ninh_so
 [ ] DB_HOST, DB_PORT, DB_PASSWORD để trống — CHƯA ghi DB_SSL_CA
 [ ] 3 khoá + TURNSTILE_SECRET_KEY: lệnh so ra GIỐNG, đếm ra 4/4
 [ ] CORS_ORIGIN=https://www.<tên miền>   CLIENT_URL (cong-khai)
 [ ] GEMINI_*, BREVO_API_KEY, MAIL_USER, BAT_XAC_THUC_EMAIL=false, CLOUDINARY_*, TRICH_CHU_OCR
 [ ] ADMIN_ALLOWED_IPS: ............ (hoặc trống)
 [ ] chmod 600 hai tệp .env
[GĐ4] giao-dien.env
 [ ] VITE_API_URL=https://api.<tên miền>
 [ ] VITE_ADMIN_API_URL=https://canbo-api.<tên miền>
[GĐ6] Kho vDBS
 [ ] DIA-CHI-KHO: ............  CONG-KHO: ......  Mã hoá: Có / Không
 [ ] log_bin_trust_function_creators=ON   [ ] Connect To Other Subnet   [ ] sao lưu 01:00/14 bản
 [ ] Giấy: mật khẩu root kho, hop_thu_ung_dung, sao_luu
 [ ] Điền DB_HOST, DB_PORT, DB_PASSWORD (+ DB_SSL_CA nếu mã hoá) vào CẢ HAI .env
[GĐ6] Bizfly
 [ ] Bucket: ............ (riêng tư, thành phố khác CS1)   Endpoint: ............
 [ ] Giấy: Access Key, Secret Key   [ ] USB: khoa-sao-luu.txt (đã xoá khỏi máy tính)
 [ ] sao-luu.cnf  [ ] sao-luu.env (AGE_RECIPIENT, RCLONE_DICH=bizfly:<bucket>)  [ ] rclone.conf
[GĐ7] Ngày bật
 [ ] DNS @ + www -> IP công khai   [ ] Turnstile thêm www.<tên miền>
 [ ] Sao lưu chạy tay ra OK   [ ] Diễn tập khôi phục G6 khớp số
```
