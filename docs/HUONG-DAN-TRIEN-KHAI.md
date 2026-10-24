# Hướng dẫn triển khai — cho người chưa làm bao giờ

Tài liệu này hướng dẫn từng bước, không giả định người đọc đã biết gì. **Làm lần đầu thì đi theo
[SO-TAY-TRIEN-KHAI.md](SO-TAY-TRIEN-KHAI.md)** — sổ tay chia chặng, chỉ tới đúng mục ở đây để chép lệnh.

- **Phần B** — dựng **máy chủ người dân** và **máy chủ cán bộ** trên **Viettel Cloud** (thay Render)
- **Phần C** — chuyển cơ sở dữ liệu sang **VNPT** (thay Aiven)
- **Phần D** — thay **Cloudinary** (kho ảnh)
- **Phần E** — thứ tự làm và danh sách kiểm cho ngày chuyển
- **Phần F** — đưa **giao diện** lên **chính máy Viettel đó** (thay Netlify/Vercel)
- **Phần G** — **sao lưu mã hoá** mỗi đêm sang nhà cung cấp khác — bắt buộc khi chạy thật
- **Phụ lục** — dự toán chi phí

> **Không dùng Vercel** (quyết định người vận hành, 2026-10-20): giao diện, máy chủ người dân và
> máy chủ cán bộ cùng chạy trên **một máy Viettel**, đưa bản mới lên bằng kịch bản ở F7. Bản trước
> có Phần A hướng dẫn Vercel — đã bỏ; những gì còn dùng được đã chuyển vào B2 và Phần F.

> Viết ngày 2026-10-06, bổ sung 2026-10-20. Giao diện các trang Viettel, VNPT, Bizfly thay đổi
> theo thời gian: nếu tên nút khác đi, tìm nút có ý nghĩa tương tự. **Giá ở Phụ lục là giá tra
> ngày 2026-10-20 — chỉ để lập dự toán ban đầu; trước khi mua phải xin báo giá chính thức.**

---

## 0. Bức tranh chung — hệ thống gồm bốn phần, ba phần đầu trên một máy Viettel

```
 Người dân / cán bộ (trình duyệt)
        │
        ▼
 ┌──────────────────┐   gọi API    ┌───────────────────────────┐   SQL    ┌──────────────┐
 │ 1. GIAO DIỆN     │ ───────────► │ 2. MÁY CHỦ (2 tiến trình) │ ───────► │ 3. CƠ SỞ     │
 │ tệp tĩnh (dist/) │              │  · công khai (người dân)  │          │    DỮ LIỆU   │
 │ máy Viettel      │              │  · cán bộ                 │          │ MySQL        │
 └──────────────────┘              │ máy Viettel (cùng máy)    │          │ Aiven → VNPT │
        │                          └───────────────────────────┘          └──────────────┘
        │ tải ảnh lên (nếu có cấu hình)          │ đọc ảnh để OCR, xoá ảnh
        ▼                                        ▼
 ┌──────────────────────────────────────────────────────┐
 │ 4. KHO ẢNH — Cloudinary → (xem Phần D)                │
 └──────────────────────────────────────────────────────┘
```

| Phần | Giữ gì | Hiện ở đâu | Chuyển sang |
|---|---|---|---|
| 1. Giao diện (trang người dân + trang cán bộ) | Chỉ tệp HTML/JS/CSS tĩnh. **Không giữ dữ liệu**, nhưng là nơi người dân **gõ** danh tính | Netlify/Vercel | **Máy Viettel** (Phần F) — Nginx phục vụ thẳng |
| 2. Máy chủ (người dân + cán bộ, hai tiến trình) | Mã xử lý, các khoá bí mật (`JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`…) | Render | **Cùng máy Viettel** (Phần B) |
| 3. Cơ sở dữ liệu | **Toàn bộ dữ liệu**: ý kiến, danh tính (đã mã hoá), nhật ký | Aiven | VNPT (Phần C) |
| 4. Kho ảnh | Ảnh bằng chứng, ảnh tin tức | Cloudinary | Xem Phần D |

**Hai điều quan trọng nhất trong cả tài liệu:**

1. **Ba khoá `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` phải chép y nguyên** từ Render sang
   máy chủ mới. Đặc biệt `ENCRYPTION_KEY`: mất hoặc gõ sai một ký tự là **mất vĩnh viễn toàn bộ
   danh tính đã lưu**, không ai khôi phục được. Trước khi làm bất cứ việc gì, chép ba khoá này ra
   giấy hoặc USB, cất vào tủ có khoá.
2. **Đừng làm mọi thứ trong một đêm.** Làm lần lượt theo Phần E: dựng và chạy thử từng phần
   trước, để đêm chuyển chỉ còn chép dữ liệu và đổi địa chỉ. Bước nào hỏng cũng quay lại được.

---

## Phần B — Dựng máy chủ trên Viettel Cloud (thay Render)

Render tự lo hết: HTTPS, tự khởi động lại, tường lửa. Trên máy chủ ảo (VPS) của Viettel,
**anh phải tự làm những việc đó**. Phần này hướng dẫn từng việc.

### B1. Hỏi Viettel trước khi mua

- [ ] Gói **Cloud Server** chạy **Ubuntu 24.04 LTS**, có **1 địa chỉ IP công khai cố định**.
- [ ] Cấu hình **khuyến nghị: 2 vCPU, 4 GB RAM, ổ SSD 50 GB** (ví dụ gói T1.Base 03 có sẵn 20 GB,
      mua thêm 30 GB — hoặc hỏi gói có sẵn ổ 40–50 GB). Đã đo tải trên đúng 2 vCPU / 4 GB: 15.000
      lượt vào trang, 2.000 người bấm cùng lúc, 1.000 người cùng gửi ý kiến — 0 lỗi máy chủ, không
      cần máy lớn hơn. 4 GB RAM thì máy tự đọc chữ trong ảnh và PDF scan (OCR) được.
- [ ] Tối thiểu tuyệt đối: 2 vCPU, 2 GB RAM, 40 GB SSD, đặt `TRICH_CHU_OCR=tat` (Word và PDF có
      chữ vẫn đọc được) và làm thêm F2. **Ổ dưới 40 GB thì không**: ổ đầy là máy chủ không ghi được
      tệp tạm và nhật ký — người dân gửi ý kiến, tố giác không được, thường đúng lúc không ai để ý.
- [ ] Có **Security Group** (tường lửa ở cổng mạng) chỉnh được trong trang quản trị.
- [ ] Có **Snapshot** (chụp nguyên ổ đĩa) để quay lại khi cài hỏng.
- [ ] Đăng ký cho **cá nhân hay cơ quan**, cần giấy tờ gì.
- [ ] **Máy này nối được tới CSDL VNPT không** (xem C1). Hai nhà mạng khác nhau thì kết nối đi
      qua Internet công cộng.

### B2. Tên miền

Máy chủ cần **tên miền** để có HTTPS. Trang giao diện chạy HTTPS thì không được gọi máy chủ
HTTP thường (trình duyệt chặn).

1. Mua tên miền (vd `ten-mien.vn`) ở nhà đăng ký tên miền — **một tên miền dùng chung** cho giao
   diện và hai máy chủ. Cơ quan nhà nước có thể cần thủ tục tên miền `.gov.vn` — hỏi bộ phận
   phụ trách của đơn vị.
2. Trong trang quản lý DNS, thêm **hai bản ghi loại A** cho hai máy chủ, cả hai trỏ về **IP của
   máy Viettel**:

| Tên (Host) | Loại | Giá trị | Dùng cho |
|---|---|---|---|
| `api` | A | IP máy Viettel | Máy chủ người dân |
| `canbo-api` | A | IP máy Viettel | Máy chủ cán bộ |

   Hai bản ghi `@` và `www` cho **giao diện** cũng trỏ về chính IP này, nhưng **đổi ở đêm chuyển**
   (F1, F8) — trước đó chúng còn trỏ về nơi đang chạy trang cũ.
3. Kiểm tra: trên Windows mở PowerShell, gõ `nslookup api.ten-mien.vn`. Ra đúng IP là xong.

> **Vì sao chung một tên miền gốc** (`www.`, `api.`, `canbo-api.` cùng `ten-mien.vn`): vé giữ đăng
> nhập của cán bộ (cookie) đặt chế độ `SameSite=Lax`, trình duyệt chỉ gửi vé khi giao diện và
> máy chủ **cùng tên miền gốc**. Khác tên miền gốc thì cán bộ phải đăng nhập lại liên tục.

> ⚠️ **Không bật "proxy" (đám mây màu cam) của Cloudflare** cho hai bản ghi này. Máy chủ chỉ tin
> đúng một lớp trung gian đứng trước nó (Nginx, cài ở B9) để lấy IP thật của người gửi. Thêm một
> lớp Cloudflare thì mọi người dân hiện chung IP của Cloudflare, và chặn spam theo IP hỏng hết.

### B3. Đăng nhập vào máy

Viettel gửi **IP** và **mật khẩu root**. Trên Windows mở **PowerShell**:

```powershell
ssh root@IP-MAY-VIETTEL
```

Lần đầu máy hỏi `Are you sure you want to continue connecting` → gõ `yes` → nhập mật khẩu (gõ
không hiện chữ là bình thường).

**Đổi sang đăng nhập bằng khoá** (an toàn hơn mật khẩu nhiều):

```powershell
# Trên máy Windows — tạo khoá (bấm Enter cho mọi câu hỏi)
ssh-keygen -t ed25519
# Xem khoá công khai, bôi đen chép lại
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

```bash
# Trên máy Viettel — dán khoá vừa chép vào tệp này, lưu: Ctrl+O, Enter, Ctrl+X
mkdir -p ~/.ssh && nano ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

Mở **một cửa sổ PowerShell mới**, gõ `ssh root@IP-MAY-VIETTEL`. Vào được **mà không bị hỏi mật
khẩu** thì mới tắt đăng nhập bằng mật khẩu:

```bash
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/99-chi-dung-khoa.conf
systemctl restart ssh
```

> Giữ cửa sổ cũ mở cho tới khi chắc cửa sổ mới vào được. Làm sai bước này là tự khoá mình ở
> ngoài, lúc đó phải vào bằng **Console** trong trang quản trị Viettel.

### B4. Tường lửa — bắt buộc, làm trước khi chạy ứng dụng

Chỉ mở ba cổng: **22** (SSH), **80** và **443** (web). **Tuyệt đối không mở cổng 4000, 4001** —
đó là cổng nội bộ của ứng dụng, chỉ Nginx trên cùng máy được gọi. Mở hai cổng này ra Internet
thì người ngoài gọi thẳng ứng dụng, vượt qua Nginx và mọi lớp chặn theo IP.

```bash
apt update && apt -y upgrade
apt -y install ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable          # gõ y khi được hỏi
ufw status          # phải thấy đúng 22, 80, 443
```

Trong trang quản trị Viettel, đặt **Security Group** giống hệt: chỉ cho vào cổng 22, 80, 443.
(Cổng 22 nên chỉ cho IP cơ quan nếu cơ quan có IP tĩnh.)

### B5. Cài phần mềm

```bash
# Node.js 22 (bản ổn định dài hạn)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs git nginx certbot python3-certbot-nginx mysql-client
node -v             # phải ra v22.x

# Tự cài bản vá bảo mật của hệ điều hành
apt -y install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades    # chọn Yes

# Hai tài khoản hệ thống riêng cho hai máy chủ — không đăng nhập được, không có quyền gì thêm
useradd --system --no-create-home --shell /usr/sbin/nologin hopthu-ck   # công khai
useradd --system --no-create-home --shell /usr/sbin/nologin hopthu-cb   # cán bộ
```

> **Vì sao hai tài khoản:** trên Render, máy chủ công khai và máy chủ cán bộ là hai máy riêng.
> Trên một VPS chung, tách tài khoản để lỡ máy chủ công khai bị chiếm thì kẻ tấn công vẫn không
> đọc được cấu hình của máy chủ cán bộ.

### B6. Lấy mã nguồn

Kho trên GitHub nên để **riêng tư**. Cho máy Viettel một **khoá chỉ-đọc** (Deploy key):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_hop_thu -N "" -C "may-chu-viettel"
cat ~/.ssh/github_hop_thu.pub     # chép dòng này
```

GitHub → kho `ans-complete` → **Settings** → **Deploy keys** → **Add deploy key** → dán vào →
**không** tích *Allow write access* → **Add key**.

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_hop_thu\n' >> ~/.ssh/config
# Lần đầu được hỏi "Are you sure you want to continue connecting" thì gõ yes
git clone -b master git@github.com:longcao1234567898-sudo/ans-complete.git /opt/hop-thu
cd /opt/hop-thu/server
npm ci --omit=dev
```

### B7. Tệp cấu hình bí mật

Trên Render, các biến nằm ở **Environment**. Ở đây chúng nằm trong hai tệp mà **chỉ root đọc
được**, đặt **ngoài** thư mục mã nguồn (để `git pull` không bao giờ đụng tới).

```bash
mkdir -p /etc/hop-thu
nano /etc/hop-thu/cong-khai.env
```

Nội dung `cong-khai.env`. Chép **giá trị đang có** trên Render: Render → dịch vụ → tab
**Environment** → bấm hiện giá trị từng biến. `www.ten-mien.vn` là địa chỉ giao diện (Phần F).

```ini
PORT=4000

DB_HOST=<máy CSDL>
DB_PORT=<cổng CSDL>
DB_USER=<tài khoản CSDL>
DB_PASSWORD=<mật khẩu CSDL>
DB_NAME=hop_thu_an_ninh_so
DB_SSL_CA=/etc/hop-thu/ca-db.pem

# BA KHOÁ — CHÉP Y NGUYÊN TỪ RENDER, GIỐNG HỆT TỆP can-bo.env
JWT_SECRET=<chép từ Render>
ENCRYPTION_KEY=<chép từ Render>
HASH_PEPPER=<chép từ Render>

CORS_ORIGIN=https://www.ten-mien.vn
CLIENT_URL=https://www.ten-mien.vn

TURNSTILE_SECRET_KEY=<chép từ Render>
GEMINI_API_KEY=<chép từ Render>
GEMINI_MODEL=<chép từ Render>
GEMINI_CHAT_MODEL=<chép từ Render>
BREVO_API_KEY=<chép từ Render>
MAIL_USER=<chép từ Render>
BAT_XAC_THUC_EMAIL=false
CLOUDINARY_CLOUD_NAME=<chép từ Render, xem Phần D>
```

Nội dung `can-bo.env`:

```ini
ADMIN_PORT=4001

DB_HOST=<giống hệt cong-khai.env>
DB_PORT=<giống hệt>
DB_USER=<giống hệt>
DB_PASSWORD=<giống hệt>
DB_NAME=hop_thu_an_ninh_so
DB_SSL_CA=/etc/hop-thu/ca-db.pem

JWT_SECRET=<GIỐNG HỆT cong-khai.env>
ENCRYPTION_KEY=<GIỐNG HỆT cong-khai.env>
HASH_PEPPER=<GIỐNG HỆT cong-khai.env>

CORS_ORIGIN=https://www.ten-mien.vn
ADMIN_CORS_ORIGIN=
# Để trống = không chặn theo IP. Cơ quan có IP tĩnh thì ghi vào, cách nhau dấu phẩy
ADMIN_ALLOWED_IPS=

CLOUDINARY_CLOUD_NAME=<xem Phần D>
CLOUDINARY_API_KEY=<xem Phần D>
CLOUDINARY_API_SECRET=<xem Phần D>
# 2 GB RAM thì ghi: tat
TRICH_CHU_OCR=
```

Dán **chứng chỉ CA của CSDL** (VNPT cấp — xem C1; tạm thời dùng `ca.pem` của Aiven) vào
`/etc/hop-thu/ca-db.pem`, rồi khoá quyền:

```bash
nano /etc/hop-thu/ca-db.pem
chmod 600 /etc/hop-thu/*.env      # chỉ root đọc được các khoá
chmod 644 /etc/hop-thu/ca-db.pem  # chứng chỉ CA là thông tin công khai
```

> **Mật khẩu CSDL nên chỉ gồm chữ và số** (dài, ngẫu nhiên). Dấu `\`, dấu nháy, dấu `$` trong
> tệp `.env` dễ bị hiểu sai, và lỗi kiểu này rất khó lần ra.

> Máy chủ **cố ý không chịu khởi động** nếu thiếu `JWT_SECRET`, `ENCRYPTION_KEY` hoặc
> `HASH_PEPPER`. Đó là thiết kế (thiếu khoá thì từ chối phục vụ, không chạy ở chế độ yếu), không
> phải lỗi cần sửa.

### B8. Cho hai máy chủ tự chạy (systemd)

systemd là bộ phận của Ubuntu lo việc **tự khởi động khi bật máy** và **tự chạy lại khi ứng
dụng chết** — trên Render việc này là tự động. Tạo hai tệp:

```bash
nano /etc/systemd/system/hop-thu-cong-khai.service
```

```ini
[Unit]
Description=Hop thu - may chu cong khai (nguoi dan)
After=network-online.target
Wants=network-online.target

[Service]
User=hopthu-ck
Group=hopthu-ck
WorkingDirectory=/opt/hop-thu/server
EnvironmentFile=/etc/hop-thu/cong-khai.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/may-chu-cong-khai.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
nano /etc/systemd/system/hop-thu-can-bo.service
```

```ini
[Unit]
Description=Hop thu - may chu can bo
After=network-online.target
Wants=network-online.target

[Service]
User=hopthu-cb
Group=hopthu-cb
WorkingDirectory=/opt/hop-thu/server
EnvironmentFile=/etc/hop-thu/can-bo.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/may-chu-can-bo.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Bật và kiểm:

```bash
systemctl daemon-reload
systemctl enable --now hop-thu-cong-khai hop-thu-can-bo
systemctl status hop-thu-cong-khai hop-thu-can-bo     # phải thấy active (running)
curl -s http://127.0.0.1:4000/api/health                # máy chủ công khai trả lời
curl -s http://127.0.0.1:4001/api/health                # máy chủ cán bộ trả lời
```

Xem nhật ký khi có lỗi: `journalctl -u hop-thu-cong-khai -n 100` (bấm `q` để thoát).

> **Vì sao chỉ root đọc được tệp `.env` mà ứng dụng vẫn chạy:** systemd đọc tệp bằng quyền root
> rồi mới chuyển sang tài khoản `hopthu-ck`/`hopthu-cb`. Ứng dụng nhận được khoá, nhưng lỡ bị
> chiếm thì cũng không mở được tệp chứa khoá trên đĩa.

### B9. Nginx và HTTPS

Nginx đứng trước, nhận HTTPS từ Internet rồi chuyển vào hai cổng nội bộ.

```bash
nano /etc/nginx/sites-available/hop-thu
```

```nginx
# Giữ sẵn kết nối tới hai máy chủ — không mở kết nối mới cho MỖI yêu cầu.
# Đo P68: 2.000 người bấm cùng lúc, thiếu khối này -> 1,2% lỗi 502; có -> 0 lỗi, nhanh gấp 3.
upstream hop_thu_cong_khai {
    server 127.0.0.1:4000;
    keepalive 256;
    keepalive_timeout 4s;    # DƯỚI 5 s: máy chủ Node tự đóng kết nối rảnh sau 5 s
}
upstream hop_thu_can_bo {
    server 127.0.0.1:4001;
    keepalive 32;
    keepalive_timeout 4s;
}

# Máy chủ công khai — cho người dân
server {
    listen 80;
    server_name api.ten-mien.vn;
    server_tokens off;
    # Ứng dụng nhận tối đa 32 MB mỗi yêu cầu (ảnh, tài liệu gửi kèm). Nginx mặc định chỉ 1 MB
    client_max_body_size 32m;

    location / {
        proxy_pass http://hop_thu_cong_khai;
        proxy_http_version 1.1;
        proxy_set_header Connection "";   # bắt buộc đi kèm upstream keepalive
        proxy_set_header Host $host;
        # GHI ĐÈ bằng IP thật của người kết nối — không nối thêm vào giá trị trình duyệt tự gửi
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}

# Máy chủ cán bộ
server {
    listen 80;
    server_name canbo-api.ten-mien.vn;
    server_tokens off;
    client_max_body_size 32m;

    location / {
        proxy_pass http://hop_thu_can_bo;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/hop-thu /etc/nginx/sites-enabled/hop-thu
rm -f /etc/nginx/sites-enabled/default
nginx -t                  # phải ra "syntax is ok" và "test is successful"
systemctl reload nginx

# Xin chứng chỉ HTTPS miễn phí (Let's Encrypt) — tự gia hạn
certbot --nginx -d api.ten-mien.vn -d canbo-api.ten-mien.vn
# Nhập email, gõ Y đồng ý điều khoản. Hỏi chuyển HTTP sang HTTPS thì chọn chuyển (redirect)
certbot renew --dry-run   # kiểm việc tự gia hạn
```

> **Đã cài theo bản cũ của mục này** (có `proxy_pass http://127.0.0.1:4000;`): thêm hai khối
> `upstream` ở đầu tệp, đổi hai dòng `proxy_pass` sang `http://hop_thu_cong_khai` /
> `http://hop_thu_can_bo`, thêm dòng `proxy_set_header Connection "";` vào cả hai, rồi
> `nginx -t && systemctl reload nginx`. Không đụng các dòng certbot đã thêm.
>
> Vì sao `keepalive_timeout 4s`: máy chủ Node đóng kết nối rảnh sau 5 s; Nginx mặc định giữ
> 60 s, có thể gửi yêu cầu vào đúng kết nối vừa bị đóng (lỗi 502). Lúc đo P72 chưa tái hiện được
> lỗi này, nhưng đặt dưới 5 s là cách phòng chuẩn và không tốn gì.

Kiểm từ máy Windows: mở trình duyệt vào `https://api.ten-mien.vn/api/health`. Có ổ khoá và ra
một đoạn chữ dạng `{"ok":true,...,"encryption":true,...}` là xong. `"encryption":false` nghĩa là
máy chủ không nhận được `ENCRYPTION_KEY` — kiểm lại tệp `.env`.

### B9b. (Tuỳ chọn) Bật IPv6 — chỉ khi Viettel cấp địa chỉ IPv6 cho máy

**Vì sao nên bật:** trên mạng 4G, hàng trăm thuê bao dùng chung một địa chỉ IPv4. Giới hạn chống
spam đếm theo mạng nên người dùng chung IP có thể bị chặn oan. Viettel, VNPT, MobiFone đã cấp IPv6
cho đa số điện thoại 4G — có IPv6 thì mỗi thuê bao một dải riêng, bớt hẳn chặn oan.

**Máy chủ đã sẵn sàng (P87):** mọi giới hạn theo mạng đếm theo **dải /64** của một thuê bao, không
theo từng địa chỉ — điện thoại IPv6 tự đổi địa chỉ trong dải của nó, đếm theo địa chỉ lẻ là kẻ phá
thoát mọi giới hạn. IPv4 không đổi gì.

1. **Máy có IPv6 chưa:** `ip -6 addr show scope global` — có dòng `inet6 2xxx:...` là có. Không có
   dòng nào thì hỏi Viettel có cấp IPv6 cho máy không; chưa có thì **bỏ qua mục này**, hệ thống vẫn
   chạy bình thường bằng IPv4.
2. **Nginx nghe cả IPv6:** trong `/etc/nginx/sites-available/hop-thu`, dưới **mỗi** dòng `listen 80;`
   thêm một dòng `listen [::]:80;`. Làm tương tự với tệp giao diện `/etc/nginx/sites-available/hop-thu-giao-dien`.
   Rồi `nginx -t && systemctl reload nginx`. (certbot tự thêm `listen [::]:443 ssl` cho phần HTTPS
   khi chạy lại `certbot --nginx -d ...` — chạy lại đúng lệnh ở B9.)
3. **Tường lửa:** `grep IPV6 /etc/default/ufw` phải ra `IPV6=yes` (mặc định của Ubuntu). Các lệnh
   `ufw allow` đã chạy tự áp cho cả IPv6.
4. **Tên miền:** trang quản lý tên miền → thêm bản ghi **AAAA** (cạnh bản ghi A đã có) cho `api`,
   `canbo-api`, `@`, `www` → địa chỉ IPv6 của máy (dòng `inet6` ở bước 1, bỏ phần `/64`).
5. **Kiểm:** từ điện thoại 4G (tắt wifi) mở `https://api.ten-mien.vn/api/health`; trên máy chủ
   `tail -f /var/log/nginx/access.log` thấy địa chỉ dạng `2xxx:...` là đã đi IPv6.

> ⚠️ Danh sách IP cơ quan (`ADMIN_ALLOWED_IPS`) so **từng địa chỉ đầy đủ**. Mạng cơ quan đi IPv6
> thì phải khai thêm địa chỉ IPv6 của cơ quan, không thì cán bộ bị chặn ở máy chủ cán bộ.

### B9c. (Tuỳ chọn) Mã xác minh số điện thoại qua Zalo — eSMS.vn

**Để làm gì:** người gửi tin có tên bấm "Gửi mã qua Zalo", nhập lại 6 số nhận được → cán bộ thấy
nhãn **"✓ Đã xác minh số"** cạnh số điện thoại. Không xác minh vẫn gửi được (nhãn "Chưa xác minh
số"). Tin ẩn danh không bao giờ thấy ô này.

**Đang thử nghiệm: CHỈ MỞ ZALO.** Gửi bằng SMS đã viết sẵn nhưng **không gửi tin nào** cho tới khi
người vận hành quyết mở (bước 7).

1. **Tài khoản eSMS:** đăng ký tại esms.vn, lấy **ApiKey** và **SecretKey** (mục quản lý API).
   **Nạp trả trước một khoản nhỏ** — hết tiền thì eSMS tự ngừng, kẻ phá có lọt mọi lớp cũng chỉ
   tiêu được chừng đó.
2. **Zalo OA + mẫu tin:** đơn vị cần Zalo OA (đã xác thực) liên kết với eSMS. Đăng ký **một mẫu tin
   OTP** (ZNS) có **một biến duy nhất là mã 6 số**. Nội dung mẫu phải **trung tính** — không có chữ
   "Công an", "tố giác", "phản ánh": tin hiện trên màn hình, người nhà hay chính kẻ bị tố cầm máy đều
   đọc được. Gợi ý: *"Ma xac nhan cua ban: {ma}. Het han sau 5 phut. Khong chia se ma nay cho bat ky
   ai."* Zalo duyệt xong sẽ cấp **OAID** và **TempID**.
   ⚠️ Nội dung trung tính chưa đủ: tin ZNS hiện dưới **tên Zalo OA** (thường là "Công an phường …"),
   SMS hiện **tên thương hiệu** — ai cầm máy người gửi cũng thấy "công an vừa nhắn". Ô xác minh đã ghi
   rõ điều này cho người dân và để họ bỏ qua; đừng xoá dòng nhắc đó khi sửa giao diện.
3. **Chạy nâng cấp CSDL:** `nang_cap_v38.sql` (nếu chưa) rồi `nang_cap_v39.sql` (xem C4).
4. **Khai `.env` của máy chủ công khai** (B7) — khoá bí mật, **không bao giờ** đặt vào biến `VITE_*`:
   ```
   KENH_XAC_MINH_SDT=zalo
   ESMS_API_KEY=...
   ESMS_SECRET_KEY=...
   ESMS_ZALO_OAID=...
   ESMS_ZALO_TEMPID=...
   ESMS_SANDBOX=1
   ```
   Máy thật **phải có** `TURNSTILE_SECRET_KEY` (chống máy tự động) — thiếu thì tính năng tự TẮT.
5. **Thử trong chế độ sandbox:** `systemctl restart hop-thu-cong-khai`, rồi
   `journalctl -u hop-thu-cong-khai -n 30` phải có dòng **`📱 Mã xác minh số điện thoại: BẬT (kênh
   zalo, trần 500 tin/ngày)`**. Dòng ghi `TẮT — ...` thì đọc lý do ngay sau chữ TẮT. Vào trang gửi
   ý kiến, nhập số của mình, bấm gửi mã: với `ESMS_SANDBOX=1` eSMS **nhận lệnh nhưng không gửi tin**
   — xem lệnh trong trang quản lý eSMS là được. Máy chủ báo "Chưa gửi được mã" thì xem
   `journalctl` dòng `[eSMS] từ chối lệnh gửi, mã ...` và tra mã đó trong tài liệu eSMS.
6. **Chạy thật:** xoá dòng `ESMS_SANDBOX=1`, khởi động lại, thử với số của mình một lần nữa.
7. **Khi người vận hành quyết MỞ SMS** (chưa làm lúc thử nghiệm): đăng ký tên thương hiệu
   (brandname) với eSMS, thêm `ESMS_BRANDNAME=...`, đổi thành `KENH_XAC_MINH_SDT=zalo,sms`, khởi động
   lại. Khi đó Zalo từ chối rõ ràng thì tự gửi SMS, và người dân có thêm nút "Không nhận được qua
   Zalo? Gửi qua tin nhắn SMS".

**Giới hạn đã cài sẵn (máy chủ kiểm):** mỗi số 3 mã/giờ (cách nhau ít nhất 1 phút, tối đa 5
mã/ngày), mỗi mạng 10 mã/giờ, mỗi vé "không phải người máy" 3 mã, chỉ số di động Việt Nam; cả hệ thống
tối đa `XAC_MINH_TRAN_NGAY` tin/ngày (mặc định 500) — chạm trần thì ngừng gửi mã tới hết ngày, **vẫn
nhận ý kiến**. Mỗi máy 3 mã/giờ cũng có, nhưng mã máy do trình duyệt tự sinh: máy tự động đổi mã mỗi
lượt là né được. Lớp đó chỉ giữ người dùng thật khỏi bấm phí lượt — **khi tính tiền tối đa có thể mất,
đừng tính nó**; chặn chi phí thật là theo mạng, vé, trần ngày và số tiền nạp trước (bước 1).

> ⚠️ **Nhật ký ở eSMS và Zalo OA là DỮ LIỆU DANH TÍNH.** Mỗi lần gửi mã, eSMS và Zalo ghi lại **số
> điện thoại + giờ gửi**. Người xin mã rồi đổi ý gửi ẩn danh (giao diện có cảnh báo, nhưng không chặn)
> thì giờ đó cộng giờ tin ẩn danh là đủ để đoán ra người gửi ở địa bàn ít tin. Vì vậy: tài khoản
> eSMS và quyền quản trị Zalo OA **chỉ giao cho người vận hành kỹ thuật**, không giao cho cán bộ xử
> lý tin; đặt thời gian lưu nhật ký ngắn nhất mà eSMS/Zalo cho phép; không xuất danh sách gửi tin.

**Tắt gấp** (nghi bị phá, hết tiền): xoá dòng `KENH_XAC_MINH_SDT` rồi khởi động lại — ô xác minh
biến mất, gửi ý kiến vẫn bình thường.

### B10. Cập nhật mã nguồn về sau

Mỗi khi có bản mới trên `master`:

```bash
cd /opt/hop-thu && git pull
cd server && npm ci --omit=dev
systemctl restart hop-thu-cong-khai hop-thu-can-bo
```

Bản mới có tệp `database/nang_cap_vXX.sql` thì chạy tệp đó vào CSDL **trước** khi khởi động lại
(cách chạy: xem C4).

**Nên chụp Snapshot** trong trang quản trị Viettel trước mỗi lần cập nhật lớn.

---

## Phần C — Chuyển cơ sở dữ liệu sang VNPT (thay Aiven)

> **Đổi phương án (2026-10-20): kho dữ liệu đặt ở Viettel (vDBS, T2.VDBS 1 Standalone, MySQL 8.0,
> Private Access) thay VNPT** — cùng nhà với máy chủ, nối bằng mạng nội bộ. Các lệnh C3, C4 dùng
> nguyên, thay địa chỉ VNPT bằng địa chỉ riêng của kho vDBS; trình tự cho người làm lần đầu:
> [SO-TAY-TRIEN-KHAI.md](SO-TAY-TRIEN-KHAI.md) chặng 1, 6, 9, 13. Phần C sẽ viết lại theo vDBS khi
> có kết quả ba phép kiểm (Phụ lục "VIỆC CHỜ").

VNPT có dịch vụ **VNPT MySQL**, dạng CSDL được quản lý sẵn (DBaaS): VNPT lo sao lưu, vá lỗi, dự
phòng.

### C1. Hỏi VNPT trước khi mua — câu nào "không" cũng phải biết trước

- [ ] Phiên bản **MySQL 8.0** (Aiven đang chạy 8.0; khác phiên bản lớn dễ lỗi khi chép dữ liệu).
- [ ] **Máy chủ ở Viettel kết nối vào được không?** CSDL nhiều nơi chỉ cho kết nối từ bên trong
      mạng riêng của chính nhà cung cấp. Nếu VNPT chỉ cho vậy thì **không ghép được Viettel với
      VNPT**. Khi đó chọn: máy chủ cũng thuê ở VNPT, hoặc CSDL cũng thuê ở Viettel.
- [ ] Có **mã hoá kết nối (TLS/SSL)** và **cấp tệp chứng chỉ CA** không. **Bắt buộc phải có**:
      kết nối đi qua Internet, không mã hoá thì danh tính vừa giải mã trên đường truyền bị đọc
      trộm được.
- [ ] Có **danh sách IP được phép kết nối** không. Chỉ cho đúng **IP máy Viettel** vào.
- [ ] **Sao lưu tự động**: bao lâu một lần, giữ bao nhiêu ngày, có **khôi phục về một thời điểm**
      (point-in-time recovery) không.
- [ ] Đặt ở trung tâm dữ liệu nào; hợp đồng cho cá nhân hay cơ quan.
- [ ] Cho đặt tham số **`log_bin_trust_function_creators = 1`** không. Bản sao dữ liệu có trigger
      (nhật ký chỉ ghi thêm) và thủ tục; thiếu tham số này thì tài khoản thường không nhập được
      (đã thử: `ERROR 1419`).
- [ ] Cấu hình: bản nhỏ nhất (1–2 vCPU, 2 GB RAM, 20 GB) là đủ cho một phường lúc đầu.
- [ ] Tạo được **tài khoản chỉ đọc** và cấp được quyền **`SHOW_ROUTINE`** cho nó không — cần cho
      sao lưu sang nơi khác (Phần G, G2 bước 2).
- [ ] **Báo giá** bản Single và bản HA (VNPT chưa công bố giá DBaaS — xem Phụ lục).

> ⚠️ **Trước khi nối máy chủ với CSDL qua Internet (Viettel ↔ VNPT), phải vá xong BUG-033** và
> BUG-033 phải qua RETEST độc lập (chi tiết trong sổ lỗi nội bộ `buglogs/`).

### C2. Tạo CSDL trên VNPT

Làm trong trang quản trị VNPT (tên nút tuỳ VNPT):

1. Tạo phiên bản MySQL 8.0 → đặt mật khẩu quản trị → ghi lại **host**, **port**, **user**.
2. Thêm **IP máy Viettel** vào danh sách được phép.
3. Tải **tệp CA** về → dán vào `/etc/hop-thu/ca-db.pem` trên máy Viettel (thay tệp của Aiven
   **vào đúng lúc chuyển**, xem C3 bước 7).
4. Thử kết nối **từ máy Viettel**:

```bash
mysql --host=HOST-VNPT --port=PORT-VNPT --user=USER-VNPT -p \
      --ssl-ca=/root/ca-vnpt.pem --ssl-mode=VERIFY_IDENTITY \
      -e "SELECT VERSION();"
```

Ra số phiên bản `8.0.x` là thông.

### C3. Chép dữ liệu từ Aiven sang VNPT

Làm **trên máy Viettel** (Linux), không làm trên Windows: PowerShell tự đổi bảng mã khi ghi tệp
và làm hỏng tiếng Việt trong bản sao.

**Chọn giờ vắng (vd 23 giờ).** Trong lúc chép, không được có ý kiến mới gửi vào Aiven, không thì
ý kiến đó mất.

```bash
# 1. Tắt nhận ý kiến: Render → từng dịch vụ → Settings → Suspend.
#    Nếu đã chạy máy Viettel nối Aiven thì tắt luôn:
systemctl stop hop-thu-cong-khai hop-thu-can-bo

# 2. Lấy ca.pem của Aiven (Aiven Console → dịch vụ MySQL → Overview → CA certificate)
nano /root/ca-aiven.pem

# 3. Xuất toàn bộ dữ liệu từ Aiven
mysqldump --host=HOST-AIVEN --port=PORT-AIVEN --user=avnadmin -p \
  --ssl-ca=/root/ca-aiven.pem --ssl-mode=VERIFY_IDENTITY \
  --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 \
  hop_thu_an_ninh_so > /root/sao-luu-aiven.sql

# 4. Bỏ dòng "người tạo" gắn với tài khoản Aiven (VNPT không có tài khoản đó, nhập sẽ lỗi)
sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g' /root/sao-luu-aiven.sql > /root/sao-luu-sach.sql

# 5. Tạo CSDL rỗng trên VNPT rồi nhập
mysql --host=HOST-VNPT --port=PORT-VNPT --user=USER-VNPT -p \
  --ssl-ca=/root/ca-vnpt.pem --ssl-mode=VERIFY_IDENTITY \
  -e "CREATE DATABASE IF NOT EXISTS hop_thu_an_ninh_so CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

mysql --host=HOST-VNPT --port=PORT-VNPT --user=USER-VNPT -p \
  --ssl-ca=/root/ca-vnpt.pem --ssl-mode=VERIFY_IDENTITY \
  --default-character-set=utf8mb4 hop_thu_an_ninh_so < /root/sao-luu-sach.sql

# 6. Đối chiếu — chạy câu này ở CẢ HAI bên (Aiven và VNPT), số phải bằng nhau
SQL="SELECT (SELECT COUNT(*) FROM submissions) y_kien, (SELECT COUNT(*) FROM submission_images) tep,
            (SELECT COUNT(*) FROM staff) can_bo, (SELECT COUNT(*) FROM staff_activity_logs) nhat_ky"
mysql --host=HOST-AIVEN --port=PORT-AIVEN --user=avnadmin -p --ssl-ca=/root/ca-aiven.pem hop_thu_an_ninh_so -e "$SQL"
mysql --host=HOST-VNPT  --port=PORT-VNPT  --user=USER-VNPT -p --ssl-ca=/root/ca-vnpt.pem  hop_thu_an_ninh_so -e "$SQL"

# 7. Trỏ máy chủ sang VNPT: sửa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD ở CẢ HAI tệp .env
nano /etc/hop-thu/cong-khai.env
nano /etc/hop-thu/can-bo.env
cp /root/ca-vnpt.pem /etc/hop-thu/ca-db.pem
systemctl start hop-thu-cong-khai hop-thu-can-bo
```

**Kiểm sau khi chuyển** — làm đủ cả bốn việc:

1. Đăng nhập trang cán bộ được.
2. Mở một hồ sơ cũ, bấm xem danh tính → **ra đúng họ tên**. Ra dòng **"[Dữ liệu hỏng hoặc sai
   khoá]"** nghĩa là `ENCRYPTION_KEY` bị chép sai: **dừng lại, chép lại cho đúng**. Tuyệt đối
   không xoá Aiven lúc này.
3. Gửi thử một ý kiến từ trang người dân → thấy nó hiện ở trang cán bộ.
4. Tra cứu bằng mã của ý kiến vừa gửi → ra đúng trạng thái.

**Xoá bản sao trên máy** (trong đó có dữ liệu thật, gồm cả danh tính đã mã hoá):

```bash
shred -u /root/sao-luu-aiven.sql /root/sao-luu-sach.sql
```

**Aiven:** giữ nguyên **1–2 tuần** phòng khi phải quay lại. Sau đó vào Aiven Console → **Delete
service**. Đây là bản sao đầy đủ dữ liệu người dân: không xoá thì nó nằm đó mãi.

**Lỗi hay gặp:**

| Thấy gì | Vì sao | Sửa |
|---|---|---|
| Lệnh `mysql` báo `ERROR 2026 ... certificate verify failed` | Dùng IP thay cho tên máy, hoặc sai tệp CA | Dùng đúng **tên máy (host)** VNPT cấp, đúng tệp CA của VNPT |
| Máy chủ báo `HANDSHAKE_SSL_ERROR` | Tệp `ca-db.pem` không phải CA của VNPT | Dán lại đúng tệp CA |
| `ERROR 1419 ... You do not have the SUPER privilege and binary logging is enabled` khi nhập | Tài khoản VNPT không có quyền SUPER, mà bản sao có trigger và thủ tục | Nhờ VNPT bật tham số `log_bin_trust_function_creators = 1` trong cấu hình CSDL. Rồi **xoá CSDL dở dang trên VNPT** (`DROP DATABASE hop_thu_an_ninh_so` — chỉ trên VNPT, kiểm kỹ host trước khi gõ) và làm lại từ bước 5 |
| `Access denied ... SUPER privilege` / `DEFINER` khi nhập | Còn dòng DEFINER | Chạy lại bước 4 |
| `Unable to create or change a table without a primary key` | VNPT bật chế độ bắt buộc khoá chính | Hỏi VNPT tắt `sql_require_primary_key` trong lúc nhập |
| Tiếng Việt thành `Ã¡Ã ` | Thiếu `--default-character-set=utf8mb4` hoặc làm trên PowerShell | Làm lại trên máy Linux, đủ tham số |

### C4. Chạy tệp nâng cấp CSDL về sau

```bash
mysql --host=HOST-VNPT --port=PORT-VNPT --user=USER-VNPT -p \
  --ssl-ca=/etc/hop-thu/ca-db.pem --default-character-set=utf8mb4 \
  hop_thu_an_ninh_so < /opt/hop-thu/database/nang_cap_vXX.sql
```

---

## Phần D — Thay Cloudinary

### D1. Cloudinary đang làm gì trong hệ thống

| Việc | Ở đâu |
|---|---|
| Trình duyệt người dân tải ảnh bằng chứng thẳng lên Cloudinary, gửi đường dẫn cho máy chủ | `src/services/uploadService.ts` (`VITE_CLOUDINARY_*`) |
| Cán bộ gắn ảnh cho tin tức | `src/pages/admin/AdminNewsPage.tsx` |
| Máy chủ công khai kiểm đường dẫn ảnh có đúng kho của đơn vị không | `CLOUDINARY_CLOUD_NAME` |
| Máy chủ cán bộ tải ảnh về để đọc chữ (OCR) | `CLOUDINARY_CLOUD_NAME` |
| Lãnh đạo xoá hẳn ảnh của hồ sơ đã xoá danh tính, xoá cả trên kho | `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (ADR-005 mục 8) |

**Hệ thống chạy được khi không có Cloudinary.** Để trống `VITE_CLOUDINARY_*` thì ảnh bằng chứng
được lưu thẳng vào CSDL. Tài liệu Word/PDF người dân gửi kèm thì vốn đã luôn lưu trong CSDL.

### D2. Ba hướng

| | **1. Không dùng kho ảnh — lưu thẳng vào CSDL VNPT** | **2. Kho lưu trữ trong nước (Object Storage, chuẩn S3)** | **3. Giữ Cloudinary** |
|---|---|---|---|
| Nhà cung cấp | Không cần thêm | **Viettel IDC** (Object Storage chuẩn S3), **Bizfly Cloud** Simple Storage (có vùng Hà Nội và TP.HCM), **VNG Cloud** vStorage. VNPT: hỏi xem có dịch vụ Object Storage không | Cloudinary (nước ngoài) |
| Dữ liệu nằm ở | Việt Nam, cùng chỗ với mọi dữ liệu khác | Việt Nam | Nước ngoài |
| Phải sửa mã? | **Không** cho ảnh bằng chứng. Ảnh tin tức: có (xem dưới) | **Có** — một phiên tính năng, có rà soát bảo mật | Không |
| Xoá ảnh khi người dân xin xoá danh tính | Xoá dòng trong CSDL là hết | Máy chủ xoá trên kho | Như hiện nay |
| Nhược điểm | CSDL phình to, sao lưu nặng hơn (đã ghi ở [NO-KY-THUAT.md](NO-KY-THUAT.md) ND-008) | Thêm một dịch vụ, thêm một bộ khoá phải giữ | Ảnh nằm ngoài lãnh thổ |

**Đề xuất cho quy mô một phường: hướng 1 trước.** Ảnh đã được trình duyệt nén còn khoảng vài
trăm KB, tối đa vài ảnh mỗi ý kiến. Lượng ý kiến của một phường thì CSDL chịu được nhiều năm. Khi
CSDL lớn tới mức sao lưu chậm, chuyển sang hướng 2.

Nếu làm hướng 2, nên làm theo kiểu **kho riêng tư**: trình duyệt gửi ảnh cho máy chủ như hiện nay,
máy chủ kiểm ảnh rồi mới cất vào kho, và chỉ cán bộ có quyền mới mở được ảnh, bằng đường dẫn có
hạn dùng. Việc này cần một ADR và một phiên `TINH-NANG`, vì chạm tới lớp kiểm ảnh, lớp chống gọi
mạng tuỳ tiện (SSRF), OCR và luồng xoá tệp sau khi xoá danh tính.

### D3. Làm hướng 1

1. Bỏ hai dòng `VITE_CLOUDINARY_CLOUD_NAME` và `VITE_CLOUDINARY_PRESET` trong tệp `.env.production`
   của mã nguồn (nhờ Claude làm trong một phiên, có chạy test), đẩy lên `master`, rồi chạy cập
   nhật F7. Từ lúc này ảnh mới lưu vào CSDL. *(Ghi dòng trống trong `/etc/hop-thu/giao-dien.env`
   **không** tắt được: kịch bản cố ý bỏ qua giá trị trống để lỡ tay không xoá mất khoá Turnstile
   — xem F3.)*
2. **Ảnh cũ vẫn nằm trên Cloudinary.** Giữ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET` ở máy chủ cán bộ để vẫn đọc chữ và xoá được ảnh cũ. **Chưa xoá tài
   khoản Cloudinary**: xoá là mất luôn ảnh bằng chứng của các hồ sơ cũ. Muốn rời Cloudinary hẳn
   thì cần một phiên chuyển ảnh cũ về CSDL trước.
3. **Ảnh tin tức chưa làm được theo hướng này:** trang đăng tin có nhánh "chưa có kho ảnh thì lưu
   thẳng", nhưng máy chủ chỉ nhận đường dẫn `http/https` và cắt ở 500 ký tự, nên lưu tin có ảnh
   sẽ báo lỗi (ghi ở [NO-KY-THUAT.md](NO-KY-THUAT.md) ND-054). Trong lúc chờ sửa: đăng tin không
   kèm ảnh, hoặc dùng ảnh có sẵn trong `public/media/`.

---

## Phần E — Thứ tự làm và danh sách kiểm

### E1. Thứ tự đề xuất — mỗi bước chạy được độc lập

Trang đang chạy (Netlify/Vercel + Render + Aiven) **vẫn phục vụ người dân** cho tới đêm chuyển.
Mọi thứ trên máy Viettel dựng và thử trước, song song.

| Bước | Việc | Người dân có bị gián đoạn? |
|---|---|---|
| 1 | **B1–B9**: dựng máy Viettel, hai máy chủ (người dân + cán bộ), tạm nối **Aiven cũ** (dùng `ca.pem` của Aiven). Thử bằng `curl` tới `https://api.…` và `https://canbo-api.…` | Không |
| 2 | **F2–F5**: dựng giao diện trên chính máy đó, thử bằng địa chỉ IP. **Chưa** đổi `@`/`www` | Không |
| 3 | **C1–C2**: mua và tạo CSDL VNPT, thử kết nối từ máy Viettel | Không |
| 4 | **Một đêm chuyển**: C3 (chép dữ liệu, Render đã Suspend) → đổi DNS `@`/`www` sang IP Viettel (F8) → F6 → kiểm đủ E2 | **Có**, khoảng 30–60 phút. Báo trước trên trang tin hoặc nhóm Zalo; việc gấp gọi 113 |
| 5 | **Phần G** ngay trong 1–2 ngày: sao lưu mã hoá, **diễn tập khôi phục G6 thành công** | Không |
| 6 | Theo dõi 1–2 tuần. Ổn thì xoá Render (**Suspend** → **Delete**), Aiven, và dự án Netlify/Vercel (F8 bước 5) | Không |
| 7 | **Phần D** hướng 1 | Không |

### E2. Danh sách kiểm cho đêm chuyển

- [ ] BUG-033 đã vá và đã qua RETEST độc lập.
- [ ] Ba khoá `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` đã chép ra giấy/USB cất kỹ, và giống
      hệt ở `cong-khai.env`, `can-bo.env`, Render.
- [ ] Chụp Snapshot máy Viettel.
- [ ] Render đã Suspend → không còn ý kiến mới vào Aiven.
- [ ] `mysqldump` xong, số đếm hai bên bằng nhau.
- [ ] Hai máy chủ trên Viettel `active (running)`, `https://api.../api/health` có ổ khoá.
- [ ] Giao diện trên máy Viettel: `/etc/hop-thu/giao-dien.env` (F3) đúng hai địa chỉ máy chủ, đã
      chạy `deploy/dung-giao-dien.sh` ra `✅`; DNS `@`/`www` đã trỏ về IP Viettel (F8).
- [ ] `CORS_ORIGIN` đúng `https://www.…`; Turnstile đã có tên miền (F6).
- [ ] Đăng nhập cán bộ được, xem danh tính hồ sơ cũ ra đúng tên, gửi thử và tra cứu được.
- [ ] Đã `shred` các tệp sao lưu trên máy.
- [ ] Trong vòng 1–2 ngày sau đêm chuyển: Phần G chạy, **G6 khôi phục thử khớp số**; khoá mở bản
      sao (`khoa-sao-luu.txt`) đã chép ra USB, cất **cùng chỗ** ba khoá ở trên.

### E3. Những thứ VẪN ở nước ngoài sau khi chuyển

Chuyển máy chủ và CSDL về Việt Nam không kéo theo các dịch vụ dưới đây. Biết để quyết định, không
phải để hoảng:

| Dịch vụ | Nhận được gì | Bỏ được không |
|---|---|---|
| ~~Vercel/Netlify~~ (giao diện) | — | **Đã bỏ** — giao diện chạy trên máy Viettel (Phần F) |
| **Cloudflare Turnstile** (chống máy tự động) | IP và trình duyệt người dân lúc gửi ý kiến | Khó — đây là lớp chống spam chính |
| **Google Gemini** (trợ lý hỏi đáp) | Những gì người dân gõ vào **ô trợ lý** (không phải nội dung ý kiến gửi đi — phân loại ý kiến chạy bằng quy tắc ngay trên máy chủ) | Được — để trống `GEMINI_API_KEY` thì tắt trợ lý |
| **Brevo** (gửi email mã xác thực) | Địa chỉ email người nhận | Được — đổi nhà gửi mail |
| **Open-Meteo** (dự báo mưa) | Chỉ toạ độ của phường, do máy chủ gọi | Không cần bỏ |
| **OpenStreetMap** (nền bản đồ) | IP người xem bản đồ | Được — cần phiên riêng |

Câu hỏi "dữ liệu phải ở trong nước tới mức nào" là câu hỏi pháp lý và nghiệp vụ, không phải kỹ
thuật: nên hỏi bộ phận phụ trách an ninh mạng hoặc pháp chế của đơn vị.

---

## Phần F — Đưa giao diện lên máy Viettel (thay Netlify/Vercel)

**Giao diện chạy trên chính máy Viettel đã dựng ở Phần B** — một máy phục vụ cả trang người
dân, trang cán bộ (`/quan-tri`) và hai máy chủ. Người dân gõ họ tên, số điện thoại vào trang giao diện **trước khi**
máy chủ mã hoá. Ai sửa được gói JS trên Netlify/Vercel (kẻ chiếm tài khoản, hoặc chính nhà
cung cấp ở nước ngoài) là đọc được danh tính ngay tại ô nhập — mã hoá ở máy chủ không cứu
được. Đặt giao diện trên máy Viettel thì cả bốn phần nằm ở Việt Nam, dưới quyền của đơn vị.

Mọi thứ cần đã có sẵn trong mã nguồn, thư mục `deploy/`:

| Tệp | Là gì |
|---|---|
| `deploy/dung-giao-dien.sh` | Kịch bản dựng giao diện và đưa lên — thay việc Netlify/Vercel tự dựng |
| `deploy/nginx/hop-thu-giao-dien.conf` | Cấu hình Nginx cho trang giao diện — cài **một lần** |
| `deploy/nginx/hop-thu-header.conf` | Header bảo mật, **giống hệt** `public/_headers` (test kiểm từng ký tự). Kịch bản tự điền địa chỉ máy chủ vào CSP — **không phải sửa tay** |

### F1. Cần có trước

- [ ] Đã xong **B1–B9**: máy Viettel chạy hai máy chủ, đã cài `nginx` và `certbot`.
- [ ] Thêm **hai bản ghi DNS loại A** (giống B2), cả hai trỏ về **IP máy Viettel**:

| Tên (Host) | Loại | Giá trị |
|---|---|---|
| `@` (tên miền trần) | A | IP máy Viettel |
| `www` | A | IP máy Viettel |

> Nếu tên miền trần/`www` đang trỏ sang Vercel/Netlify thì **chưa đổi** — đổi ở đêm chuyển (F8).
> Trước đó có thể làm F2–F4 và thử bằng địa chỉ IP.

### F2. Bộ nhớ đệm cho máy 2 GB RAM

Dựng giao diện cần khoảng 1,5 GB bộ nhớ. Máy 2 GB đang chạy hai máy chủ thì dễ thiếu, báo
`JavaScript heap out of memory`. Thêm 2 GB bộ nhớ ảo trên đĩa (làm một lần; máy 4 GB bỏ qua):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h            # dòng Swap phải ra 2.0Gi
```

### F3. Tệp biến của giao diện

```bash
nano /etc/hop-thu/giao-dien.env
```

```ini
VITE_API_URL=https://api.ten-mien.vn
VITE_ADMIN_API_URL=https://canbo-api.ten-mien.vn
```

- **Chỉ ghi biến `VITE_*`** — chúng bị nhúng vào JS công khai, ai mở trình duyệt cũng đọc được.
  Kịch bản cố ý **bỏ qua mọi dòng khác**, nên lỡ dán khoá bí mật vào cũng không lọt ra ngoài —
  nhưng đừng dán.
- Địa chỉ phải đúng dạng `https://ten-mien` — **chữ thường, không có `/` ở cuối**. Sai dạng thì
  kịch bản dừng ngay, không đụng tới trang đang chạy.
- `VITE_TURNSTILE_SITE_KEY`, `VITE_CLOUDINARY_*`: **không cần ghi** — không có thì lấy giá trị
  trong `.env.production` của mã nguồn. Ghi dòng mà để trống giá trị cũng không ghi đè.

### F4. Dựng lần đầu

```bash
cd /opt/hop-thu && git pull
bash deploy/dung-giao-dien.sh
```

Chạy mất 2–5 phút. Cuối cùng phải thấy `✅ Đã đưa lên: /var/www/hop-thu/ban-…`. Thấy `❌` thì
đọc dòng đó — mỗi lỗi đều nói rõ phải sửa gì (bảng F10).

### F5. Cài cấu hình Nginx cho giao diện (một lần)

Thay `congan-phuong.vn` bằng **tên miền thật** (không có `www`):

```bash
cp /opt/hop-thu/deploy/nginx/hop-thu-giao-dien.conf /etc/nginx/sites-available/hop-thu-giao-dien
sed -i 's/ten-mien\.vn/congan-phuong.vn/g' /etc/nginx/sites-available/hop-thu-giao-dien
ln -s /etc/nginx/sites-available/hop-thu-giao-dien /etc/nginx/sites-enabled/hop-thu-giao-dien
nginx -t && systemctl reload nginx

# HTTPS miễn phí cho cả tên miền trần và www (certbot tự sửa tệp vừa cài)
certbot --nginx -d congan-phuong.vn -d www.congan-phuong.vn
```

> ⚠️ **Sau bước này đừng chép đè tệp `sites-available/hop-thu-giao-dien` nữa** — sẽ mất phần
> HTTPS certbot đã thêm. Các lần cập nhật sau chỉ chạy kịch bản (F7); kịch bản không đụng tệp
> này.

> Header `Strict-Transport-Security` có `includeSubDomains`: sau khi trang chạy HTTPS, trình duyệt
> sẽ **chỉ** chịu vào mọi tên miền con của tên miền này bằng HTTPS trong 2 năm. `api.` và
> `canbo-api.` đã có HTTPS (B9) nên không sao — chỉ nhớ đừng dựng tên miền con nào chạy HTTP.

### F6. Nối giao diện với máy chủ

1. Ở **cả hai** tệp `/etc/hop-thu/cong-khai.env` và `can-bo.env`:
   `CORS_ORIGIN=https://www.congan-phuong.vn` (và `CLIENT_URL` cùng giá trị ở `cong-khai.env`).
   Chưa đổi DNS mà muốn trang cũ trên Netlify/Vercel vẫn gọi được thì ghi thêm địa chỉ đó, cách
   nhau dấu phẩy — bỏ đi ở F8 bước 5.
2. `systemctl restart hop-thu-cong-khai hop-thu-can-bo`
3. **Turnstile**: dash.cloudflare.com → Turnstile → site → Hostname Management → thêm
   `www.congan-phuong.vn`.
4. **Không cần sửa CSP** — kịch bản đã điền địa chỉ máy chủ từ F3.

**Kiểm** (từ máy Windows):

- [ ] Mở `https://www.congan-phuong.vn` có ổ khoá; bấm **F12 → Console**: **không** có dòng đỏ nào
      chứa `Content Security Policy` hay `CORS`.
- [ ] Gõ thẳng `https://www.congan-phuong.vn/tra-cuu` rồi bấm **F5** — trang vẫn hiện (không 404).
- [ ] `https://congan-phuong.vn` (không `www`) tự chuyển sang `https://www.…`.
- [ ] Gửi thử một ý kiến, tra cứu được; cán bộ đăng nhập được.
- [ ] PowerShell: `curl.exe -sI https://www.congan-phuong.vn | findstr /i "content-security x-frame"`
      ra hai dòng, dòng CSP có `https://api.congan-phuong.vn`.

### F7. Cập nhật về sau

Mỗi khi có bản mới trên `master` — thay cho B10:

```bash
cd /opt/hop-thu && git pull
cd server && npm ci --omit=dev && cd ..
systemctl restart hop-thu-cong-khai hop-thu-can-bo
bash deploy/dung-giao-dien.sh
```

Kịch bản đổi bản **một nhát** (không có lúc nào trang trống), chạy `nginx -t` trước khi nạp, và
**tự quay về bản cũ** nếu cấu hình mới hỏng. Nó giữ 5 bản gần nhất.

### F8. Đêm chuyển: đổi DNS từ Netlify/Vercel sang máy Viettel

1. Làm xong F2–F6 với địa chỉ IP / bản ghi tạm, kiểm đủ danh sách F6.
2. Đổi bản ghi DNS `@` và `www` sang IP máy Viettel (F1). Chờ 5–60 phút cho DNS cập nhật —
   `nslookup www.congan-phuong.vn` ra IP Viettel là xong.
3. Chạy `certbot --nginx …` (F5) nếu lúc trước chưa xin được chứng chỉ vì DNS chưa trỏ về.
4. Kiểm lại danh sách F6.
5. Để Vercel/Netlify chạy thêm 1–2 tuần cho chắc, rồi xoá dự án: Netlify → **Site configuration
   → Delete this site**; Vercel → **Settings → Delete Project**. Bỏ địa chỉ `….netlify.app` /
   `….vercel.app` khỏi `CORS_ORIGIN` và Turnstile.

### F9. Quay về bản trước bằng tay

Bản mới chạy được nhưng có lỗi giao diện (kịch bản không biết được loại lỗi này):

```bash
ls -1dt /var/www/hop-thu/ban-*          # bản trên cùng là bản đang chạy
CU=$(ls -1dt /var/www/hop-thu/ban-* | sed -n 2p)      # bản ngay trước
ln -sfn "$CU" /var/www/hop-thu/hien-tai.moi && mv -Tf /var/www/hop-thu/hien-tai.moi /var/www/hop-thu/hien-tai
systemctl reload nginx
```

Lần chạy kịch bản sau sẽ đưa bản mới nhất lên lại.

### F10. Lỗi hay gặp

| Thấy gì | Vì sao | Sửa |
|---|---|---|
| `❌ VITE_API_URL phải có dạng https://…` | Có `/` ở cuối, chữ hoa, `http://`, thừa dấu cách | Sửa `/etc/hop-thu/giao-dien.env` (F3) |
| `JavaScript heap out of memory` khi dựng | Thiếu bộ nhớ | F2 |
| `❌ Gói JS không chứa https://…` | Tên biến gõ sai (vd `VITE_API_URl`) — bản dựng lấy địa chỉ cũ trong `.env.production` | Sửa tên biến đúng như F3 |
| `❌ nginx -t báo lỗi — đã trả lại bản cũ` | Cấu hình Nginx có lỗi; **trang đang chạy không sao** | Chạy `nginx -t` để xem dòng lỗi; gửi cho Claude |
| Trang báo **403 Forbidden** | Nginx không đọc được `/var/www/hop-thu` | `chmod 755 /var/www /var/www/hop-thu` |
| Console: `violates … connect-src` | Địa chỉ ở F3 khác địa chỉ máy chủ thật | Sửa F3, chạy lại F4 |
| Console: `blocked by CORS policy` | `CORS_ORIGIN` chưa có `https://www.…` | F6-1 |
| Ô "Tôi không phải máy" báo lỗi tên miền | Turnstile chưa có hostname mới | F6-3 |

> **Trang cán bộ** (`/quan-tri`) cũng nằm trong giao diện này — đó chỉ là tệp tĩnh, không chứa dữ
> liệu. Lớp chặn thật là **máy chủ cán bộ**: `ADMIN_ALLOWED_IPS` (B7) chỉ cho IP cơ quan gọi
> `canbo-api.…`. Đó là nơi nên khoá, không phải ở giao diện (luật: kiểm ở máy chủ, luôn luôn).

---

## Phần G — Sao lưu mã hoá sang nhà cung cấp khác (bắt buộc khi chạy thật)

### G1. Vì sao cần, khi VNPT đã tự sao lưu

VNPT sao lưu nằm **cùng một chỗ** với CSDL: tài khoản VNPT bị khoá, bị chiếm, xoá nhầm cả
dịch vụ, hay trung tâm dữ liệu gặp sự cố thì mất cả CSDL lẫn bản sao. Phần này gửi thêm **một
bản mỗi đêm sang kho của nhà cung cấp khác** (Bizfly Simple Storage — cùng loại kho ở Phần D
hướng 2; dùng kho S3 của Viettel cũng được).

Bản sao chứa **nội dung tố giác** (danh tính đã được mã hoá bằng `ENCRYPTION_KEY`, nhưng lời kể,
ảnh — nếu theo Phần D hướng 1 — thì không). Vì vậy:

- **Mã hoá trên máy Viettel trước khi gửi đi.** Kho chỉ nhận về những byte vô nghĩa.
- Dùng **khoá công khai** (công cụ `age`): máy Viettel chỉ giữ khoá **khoá lại được**; khoá
  **mở ra** nằm trên USB cất tủ. Kẻ chiếm được máy Viettel cũng không mở được các bản cũ trên kho.
- **Chữ trần không bao giờ ghi xuống đĩa**: lệnh sao lưu → nén → mã hoá → tải lên chạy liền một
  mạch, không qua tệp trung gian (ổ SSD không xoá sạch được bằng `shred`).

> Khôi phục bản sao chỉ đọc lại được danh tính nếu còn **đúng ba khoá** `JWT_SECRET`,
> `ENCRYPTION_KEY`, `HASH_PEPPER` cũ. Cất khoá mở bản sao **cùng chỗ** với ba khoá đó (E2).

### G2. Chuẩn bị — làm một lần

**1. Trên Bizfly** (tên nút tuỳ Bizfly):

- [ ] Tạo một **bucket riêng**, chế độ **riêng tư** (private), ví dụ `hop-thu-sao-luu`.
- [ ] Tạo **khoá truy cập (Access Key / Secret Key)**. Hỏi Bizfly có giới hạn khoá chỉ dùng cho
      bucket này được không — được thì giới hạn.
- [ ] Ghi lại **địa chỉ endpoint S3** của vùng đã chọn (trang Bizfly ghi sẵn).

**2. Trên VNPT — tài khoản CSDL chỉ đọc, chỉ dùng để sao lưu.** Không dùng tài khoản của máy
chủ: tài khoản đó ghi được, lộ ra là sửa được dữ liệu.

```sql
CREATE USER 'sao_luu'@'IP-MAY-VIETTEL' IDENTIFIED BY '<mật khẩu dài, chỉ chữ và số>';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON hop_thu_an_ninh_so.* TO 'sao_luu'@'IP-MAY-VIETTEL';
GRANT SHOW_ROUTINE ON *.* TO 'sao_luu'@'IP-MAY-VIETTEL';
```

> ⚠️ **Đừng bỏ dòng `SHOW_ROUTINE`.** Đã thử: thiếu quyền này, `mysqldump` **không báo lỗi gì**
> mà lặng lẽ bỏ hết các thủ tục (stored procedure) khỏi bản sao — trông như sao lưu thành công,
> đến lúc khôi phục mới thấy thiếu. VNPT không cho cấp quyền này qua tài khoản quản trị thì
> hỏi VNPT cấp giúp. Buổi diễn tập G6 so số thủ tục để bắt đúng lỗi này.

**3. Trên máy tính ở cơ quan (KHÔNG làm trên máy Viettel)** — tạo cặp khoá mã hoá:

```bash
age-keygen -o khoa-sao-luu.txt
```

Lệnh in ra một dòng `Public key: age1...` — đó là **khoá công khai**, chép lại. Tệp
`khoa-sao-luu.txt` là **khoá mở**: chép ra 2 USB, cất cùng chỗ ba khoá ở E2, rồi xoá khỏi máy
tính. (Máy Windows: tải `age` cho Windows tại <https://github.com/FiloSottile/age/releases>.)

**4. Trên máy Viettel:**

```bash
apt install -y age rclone mysql-client
useradd --system --no-create-home --shell /usr/sbin/nologin hopthu-sl
```

Tệp mật khẩu CSDL cho lệnh sao lưu — đặt trong tệp chứ không ghi trên dòng lệnh, để mật khẩu
không hiện trong danh sách tiến trình:

```bash
nano /etc/hop-thu/sao-luu.cnf
```

```ini
[client]
user=sao_luu
password=<mật khẩu ở bước 2>
host=<giống DB_HOST>
port=<giống DB_PORT>
ssl-ca=/etc/hop-thu/ca-db.pem
ssl-mode=VERIFY_IDENTITY
```

`VERIFY_IDENTITY` kiểm cả chứng chỉ lẫn tên máy — đúng kiểu máy chủ ứng dụng đang kiểm (B7). Máy
chủ nối được CSDL thì lệnh sao lưu cũng nối được.

Tệp cấu hình sao lưu:

```bash
nano /etc/hop-thu/sao-luu.env
```

```ini
DB_NAME=hop_thu_an_ninh_so
SAO_LUU_CNF=/etc/hop-thu/sao-luu.cnf
AGE_RECIPIENT=age1...dán khoá công khai ở bước 3...
RCLONE_DICH=bizfly:hop-thu-sao-luu
```

Khai kho Bizfly cho `rclone`:

```bash
nano /etc/hop-thu/rclone.conf
```

```ini
[bizfly]
type = s3
provider = Other
access_key_id = <Access Key ở bước 1>
secret_access_key = <Secret Key ở bước 1>
endpoint = <endpoint ở bước 1>
acl = private
```

Khoá quyền — chỉ người dùng sao lưu đọc được:

```bash
chown hopthu-sl:hopthu-sl /etc/hop-thu/sao-luu.cnf /etc/hop-thu/sao-luu.env /etc/hop-thu/rclone.conf
chmod 600 /etc/hop-thu/sao-luu.cnf /etc/hop-thu/sao-luu.env /etc/hop-thu/rclone.conf
```

### G3. Tệp lệnh sao lưu

```bash
nano /usr/local/bin/hop-thu-sao-luu.sh
```

```bash
#!/bin/bash
# Sao lưu CSDL hằng đêm sang kho ở nhà cung cấp khác (Phần G).
# Chữ trần KHÔNG BAO GIỜ chạm đĩa: dump -> nén -> mã hoá -> tải lên, chạy liền một mạch.
set -euo pipefail
source "${SAO_LUU_ENV:-/etc/hop-thu/sao-luu.env}"   # DB_NAME, AGE_RECIPIENT, RCLONE_DICH, SAO_LUU_CNF
TEN="hop-thu-$(date +%F-%H%M).sql.gz.age"

# Tải lên dưới tên tạm; chỉ đổi sang tên thật khi CẢ chuỗi thành công.
# Không làm vậy thì lần hỏng giữa chừng vẫn để lại một tệp cụt trông như bản sao lưu.
if ! mysqldump --defaults-extra-file="$SAO_LUU_CNF" --single-transaction --routines --triggers \
       --no-tablespaces --set-gtid-purged=OFF "$DB_NAME" \
     | gzip -9 | age -r "$AGE_RECIPIENT" | rclone rcat "$RCLONE_DICH/$TEN.dang-tai"; then
  rclone deletefile "$RCLONE_DICH/$TEN.dang-tai" 2>/dev/null || true
  echo "LOI: sao luu that bai, khong co ban moi" >&2
  exit 1
fi
rclone moveto "$RCLONE_DICH/$TEN.dang-tai" "$RCLONE_DICH/$TEN"

# Giữ 30 ngày gần nhất.
rclone delete --min-age 30d --include "hop-thu-*.sql.gz.age" "$RCLONE_DICH"
echo "OK $TEN"
```

```bash
chmod 755 /usr/local/bin/hop-thu-sao-luu.sh
```

Chạy thử bằng tay một lần:

```bash
sudo -u hopthu-sl env RCLONE_CONFIG=/etc/hop-thu/rclone.conf /usr/local/bin/hop-thu-sao-luu.sh
sudo -u hopthu-sl env RCLONE_CONFIG=/etc/hop-thu/rclone.conf rclone ls bizfly:hop-thu-sao-luu
```

Phải in `OK hop-thu-....sql.gz.age` và thấy tệp đó trên kho. Xong **làm ngay G6** một lần.

### G4. Cho chạy tự động mỗi đêm (systemd)

```bash
nano /etc/systemd/system/hop-thu-sao-luu.service
```

```ini
[Unit]
Description=Hop thu - sao luu CSDL ma hoa sang kho khac
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=hopthu-sl
Group=hopthu-sl
Environment=RCLONE_CONFIG=/etc/hop-thu/rclone.conf
ExecStart=/usr/local/bin/hop-thu-sao-luu.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
```

```bash
nano /etc/systemd/system/hop-thu-sao-luu.timer
```

```ini
[Unit]
Description=Hop thu - sao luu luc 2 gio 30 sang moi ngay

[Timer]
# Ghi rõ múi giờ: máy Ubuntu mới thường để UTC, khi đó "2:30" là 9:30 sáng giờ Việt Nam
OnCalendar=*-*-* 02:30:00 Asia/Ho_Chi_Minh
# Máy tắt lúc 2 giờ 30 thì bật lên chạy bù ngay
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now hop-thu-sao-luu.timer
systemctl list-timers hop-thu-sao-luu.timer      # thấy giờ chạy kế tiếp là được
```

### G5. Kiểm mỗi tuần — 1 phút

```bash
journalctl -u hop-thu-sao-luu.service --since "7 days ago" | grep -E "OK|LOI"
sudo -u hopthu-sl env RCLONE_CONFIG=/etc/hop-thu/rclone.conf rclone lsl bizfly:hop-thu-sao-luu | tail -3
```

Phải có một dòng `OK` mỗi đêm, và tệp mới nhất là của đêm qua. Có `LOI` hay thiếu đêm nào thì
xem dòng lỗi ngay phía trên nó (bảng G7).

### G6. Diễn tập khôi phục — lần đầu ngay sau G3, rồi mỗi tháng một lần

**Bản sao chưa từng khôi phục thử thì coi như chưa có bản sao.** Làm trên **máy tính ở cơ
quan** hoặc một CSDL thử, **không** khôi phục đè lên CSDL đang chạy.

```bash
# 1. Lấy bản mới nhất về (cần rclone khai kho như G2 bước 4)
rclone copy bizfly:hop-thu-sao-luu/hop-thu-NGAY-GIO.sql.gz.age .

# 2. Tạo CSDL thử rồi mở khoá, giải nén, bỏ dòng DEFINER (như C3) và nhập
mysql -u root -p -e "CREATE DATABASE thu_khoi_phuc CHARACTER SET utf8mb4;"
age -d -i khoa-sao-luu.txt hop-thu-NGAY-GIO.sql.gz.age | gunzip \
  | sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g' | mysql -u root -p thu_khoi_phuc
```

So bản khôi phục với CSDL thật — chạy câu này trên **cả hai** (`thu_khoi_phuc` và CSDL VNPT):

```sql
SELECT 'bang', COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
UNION ALL SELECT 'trigger', COUNT(*) FROM information_schema.triggers WHERE trigger_schema = DATABASE()
UNION ALL SELECT 'thu tuc', COUNT(*) FROM information_schema.routines WHERE routine_schema = DATABASE()
UNION ALL SELECT 'view', COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE()
UNION ALL SELECT 'y kien', (SELECT COUNT(*) FROM submissions);
```

Bốn dòng đầu phải **bằng nhau**; dòng `y kien` của bản sao chỉ được ít hơn số ý kiến gửi vào từ
lúc sao lưu tới giờ. Xong thì xoá CSDL thử và tệp đã tải về:

```bash
mysql -u root -p -e "DROP DATABASE thu_khoi_phuc;"
rm hop-thu-NGAY-GIO.sql.gz.age
```

> Đã chạy thử đúng các lệnh ở G3 và G6 trên MySQL 8.0 (2026-10-20), kho là thư mục trên máy thay
> cho Bizfly, kết nối CSDL không qua TLS: khôi phục ra đủ 28 bảng, 5 trigger, 4 thủ tục, 10 view,
> số ý kiến khớp từng dòng. Sao lưu hỏng giữa chừng (sai mật khẩu) thì báo `LOI` và **không** để
> lại tệp cụt trên kho; bản cũ hơn 30 ngày bị xoá, tệp khác trong kho không bị đụng. **Chưa thử**
> với Bizfly thật và TLS của VNPT — lần chạy tay đầu tiên ở G3 chính là phép thử đó.

### G7. Lỗi hay gặp

| Thấy gì | Vì sao | Làm gì |
|---|---|---|
| Khôi phục ra `thu tuc` = 0, CSDL thật có | Thiếu quyền `SHOW_ROUTINE` (G2 bước 2) | Cấp quyền, chạy lại G3, làm lại G6 |
| `Access denied ... PROCESS privilege` | Thiếu `--no-tablespaces` | Dùng đúng tệp lệnh ở G3 |
| `Access denied for user 'sao_luu'` | Sai mật khẩu, hoặc VNPT chưa cho IP máy Viettel | Kiểm `sao-luu.cnf`; kiểm danh sách IP ở C1 |
| `SSL connection error` | Sai đường dẫn hoặc sai tệp CA | `ssl-ca` phải trỏ đúng tệp CA của VNPT (B7) |
| `403 Forbidden` / `AccessDenied` từ rclone | Khoá Bizfly sai hoặc không có quyền với bucket | Kiểm `rclone.conf`, quyền của khoá |
| `no identity matched any of the recipients` | Mở bằng sai khoá | Dùng đúng `khoa-sao-luu.txt` đi cặp với `AGE_RECIPIENT` |
| Không có dòng `OK` đêm qua, cũng không có `LOI` | Bộ hẹn giờ chưa bật | `systemctl enable --now hop-thu-sao-luu.timer` |

---

## Phụ lục — VIỆC CHỜ: kiểm kho dữ liệu Viettel (vDBS) khi dùng thử

> Ghi ngày 2026-10-20 theo yêu cầu người vận hành: **làm khi đã có kho vDBS dùng thử** (gói
> T2.VDBS 1 Standalone, MySQL 8.0, Private Access, chung VPC với máy CS1). Tài liệu Viettel
> không trả lời ba câu này; chạy ba phép kiểm dưới đây là biết chắc.

Đã biết từ tài liệu Viettel (tra 2026-10-20): kho vDBS nằm trong **mạng con riêng**, nối với máy
chủ bằng **Actions → Connect To Other Subnet** (tự đặt luật tường lửa chỉ cho mạng con của máy
chủ vào); sao lưu tự động **hằng ngày/tuần**, giữ **≥ 7 bản**, khôi phục thành kho mới; **không
thấy** khôi phục về từng phút. Khách được giao **tài khoản root** của kho.

Làm trên **máy CS1** (B3: vào máy bằng PowerShell). Lần đầu cài công cụ: `apt install -y mysql-client`.
`DIA-CHI-KHO` là địa chỉ riêng (private host) Viettel ghi trên trang quản trị vDBS. Mỗi lệnh
hỏi mật khẩu root của kho — gõ vào, không hiện chữ là bình thường. **Không dán mật khẩu cho ai.**

**Kiểm 1 — kho có mã hoá đường nối không**

```bash
mysql -h DIA-CHI-KHO -u root -p --ssl-mode=REQUIRED -e "SHOW STATUS LIKE 'Ssl_cipher';"
```

| Thấy gì | Nghĩa là |
|---|---|
| Một dòng `Ssl_cipher` có chữ phía sau (vd `TLS_AES_256_GCM_SHA384`) | **Có mã hoá.** Hỏi Viettel tệp chứng chỉ CA để máy chủ kiểm cả "con dấu" (B7, `DB_SSL_CA`) |
| Báo lỗi có chữ `SSL` | **Không có mã hoá.** Vẫn dùng được vì đường nối nằm trong mạng con riêng — ghi vào sổ theo dõi, hỏi Viettel khi nào hỗ trợ |

**Kiểm 2 — cấp được quyền `SHOW_ROUTINE` cho tài khoản sao lưu không**

```bash
mysql -h DIA-CHI-KHO -u root -p -e "CREATE USER 'thu_quyen'@'%' IDENTIFIED BY 'ThuQuyen12345'; GRANT SHOW_ROUTINE ON *.* TO 'thu_quyen'@'%'; SHOW GRANTS FOR 'thu_quyen'@'%'; DROP USER 'thu_quyen'@'%';"
```

| Thấy gì | Nghĩa là |
|---|---|
| Có dòng `GRANT SHOW_ROUTINE ON *.*` | **Được.** Phần G (G2 bước 2) làm đúng như viết |
| `Access denied` | **Không được.** Báo Claude: sửa Phần G để dựng lại thủ tục từ mã nguồn thay vì lấy từ bản sao |

(Tài khoản `thu_quyen` chỉ để thử, lệnh tự xoá nó ở cuối.)

**Kiểm 3 — tham số `log_bin_trust_function_creators` chỉnh được không**

```bash
mysql -h DIA-CHI-KHO -u root -p -e "SHOW VARIABLES LIKE 'log_bin_trust_function_creators';"
```

| Thấy gì | Nghĩa là |
|---|---|
| Giá trị `ON` | **Đã bật sẵn**, chép dữ liệu cũ sang được |
| Giá trị `OFF` | Vào trang quản trị vDBS, tìm mục **tham số / cấu hình (parameter)** của kho, đặt `log_bin_trust_function_creators` = `1`, khởi động lại kho nếu trang yêu cầu, chạy lại lệnh trên phải ra `ON`. Không có mục đó thì nhờ Viettel bật, hoặc nhờ Viettel chép dữ liệu cũ giúp |

Xong ba phép kiểm: gửi Claude **ảnh chụp kết quả** (che mật khẩu nếu có) để cập nhật Phần C, G và
đóng việc chờ ND-066.

---

## Phụ lục — Dự toán chi phí (tra ngày 2026-10-20)

> ⚠️ Giá cũ đi rất nhanh. Bảng này để **lập dự toán ban đầu**; trước khi trình duyệt phải **xin
> báo giá chính thức**, nhất là hai dòng có ghi "cần báo giá". Đơn vị: đồng/tháng, **đã gồm VAT 10%**.

| Hạng mục | Cấu hình | Khuyến nghị | Tối đa | Căn cứ |
|------------------|------------------|----------:|----------:|------------------------------------------|
| Viettel Cloud Server (2 máy chủ + giao diện + Nginx) | T1.Base 03: 2 vCPU, 4 GB RAM, 20 GB SSD | 438.900 | 438.900 | 399.000 chưa VAT. Đã đo tải trên đúng cấu hình này (B1) |
| Thêm ổ SSD | +30 GB / +50 GB | 99.000 | 165.000 | ~30.000/10 GB chưa VAT — **cần Viettel báo giá** |
| VNPT MySQL (CSDL) | 1 máy (Single) / 2 máy dự phòng (HA) | 572.000 | 1.144.000 | VNPT chưa công bố giá DBaaS; tính ~520.000 chưa VAT/máy, cao hơn VNPT Cloud Server cùng cấu hình (379.000) để không dự toán thiếu — **cần VNPT báo giá** |
| Sao lưu khác nhà cung cấp (Phần G, kho S3 Bizfly) | ≤100 GB lưu, ≤50 GB tải về | 55.000 | 110.440 | 864 đ/GB/tháng, tải về 280 đ/GB, tối thiểu 50.000 (chưa VAT) |
| Thay Cloudinary (Phần D hướng 1) | Ảnh lưu trong CSDL | 0 | 0 | Chọn hướng 2 thì dùng chung kho ở dòng trên |
| Tên miền .vn (quy ra tháng) | | 38.333 | 55.833 | Gia hạn ~460.000/năm; năm đầu ~450.000–670.000 |
| HTTPS, băng thông, Turnstile, Brevo, Gemini | | 0 | 0 | Miễn phí ở quy mô phường |
| Dự phòng phát sinh 15% | | — | 287.126 | 15% × 1.914.173 |
| **Cộng / tháng** | | **1.203.233** | **2.201.299** | |
| **Cộng / năm** | | **14.438.800** | **26.415.592** | Khuyến nghị: 1.164.900 × 12 + 460.000. Tối đa: (1.858.340 × 12 + 670.000) × 1,15 |

---

## Nguồn tham khảo (tra ngày 2026-10-06)

- VNPT MySQL (DBaaS): <https://cloud.vnpt.vn/dich-vu/my-sql>, <https://cloud.vnpt.vn/dich-vu/cloud-database>
- Viettel Cloud Server, Object Storage của Viettel IDC: <https://viettelcloud.vn>, <https://cloudian.com/press/viettel-idc-chooses-cloudian-object-storage-as-foundation-for-service-offerings.md>
- Bizfly Cloud Simple Storage: <https://bizflycloud.vn/en/s3-simple-storage> (giá tra 2026-10-20: <https://bizflycloud.vn/s3-simple-storage>)
- Giá Viettel Cloud Server (tra 2026-10-20): <https://viettelidcvn.com/cloud-server/>, <https://viettel-idc.com.vn/index.php/dich-vu/viettel-cloud-server.html>
- Giá VNPT Cloud Server (tra 2026-10-20): <https://cloud.vnpt.vn/en/service/cloud-server>
- Phí tên miền .vn (tra 2026-10-20): <https://www.matbao.net/ten-mien/bang-gia-ten-mien>, <https://nhanhoa.com/trang/ten-mien/bang-gia-ten-mien.html>
- Công cụ mã hoá `age`: <https://github.com/FiloSottile/age> · `rclone` với kho S3: <https://rclone.org/s3/>
- VNG Cloud vStorage: <https://docs.vngcloud.vn/vng-cloud-document/vn/vstorage/object-storage>
