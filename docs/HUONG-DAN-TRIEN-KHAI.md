# Hướng dẫn triển khai — cho người chưa làm bao giờ

Tài liệu này hướng dẫn từng bước, không giả định người đọc đã biết gì:

- **Phần A** — đưa giao diện lên **Vercel**
- **Phần B** — dựng máy chủ trên **Viettel Cloud** (thay Render)
- **Phần C** — chuyển cơ sở dữ liệu sang **VNPT** (thay Aiven)
- **Phần D** — thay **Cloudinary** (kho ảnh)
- **Phần E** — thứ tự làm và danh sách kiểm cho ngày chuyển

> Viết ngày 2026-10-06. Giao diện các trang Vercel, Viettel, VNPT thay đổi theo thời gian:
> nếu tên nút khác đi, tìm nút có ý nghĩa tương tự. **Giá và gói dịch vụ: hỏi trực tiếp nhà
> cung cấp** — tài liệu này cố ý không ghi giá vì giá cũ đi rất nhanh.

---

## 0. Bức tranh chung — hệ thống gồm bốn phần

```
 Người dân / cán bộ (trình duyệt)
        │
        ▼
 ┌──────────────────┐   gọi API    ┌───────────────────────────┐   SQL    ┌──────────────┐
 │ 1. GIAO DIỆN     │ ───────────► │ 2. MÁY CHỦ (2 tiến trình) │ ───────► │ 3. CƠ SỞ     │
 │ tệp tĩnh (dist/) │              │  · công khai (người dân)  │          │    DỮ LIỆU   │
 │ Vercel           │              │  · cán bộ                 │          │ MySQL        │
 └──────────────────┘              │ Render → Viettel Cloud    │          │ Aiven → VNPT │
        │                          └───────────────────────────┘          └──────────────┘
        │ tải ảnh lên (nếu có cấu hình)          │ đọc ảnh để OCR, xoá ảnh
        ▼                                        ▼
 ┌──────────────────────────────────────────────────────┐
 │ 4. KHO ẢNH — Cloudinary → (xem Phần D)                │
 └──────────────────────────────────────────────────────┘
```

| Phần | Giữ gì | Hiện ở đâu | Chuyển sang |
|---|---|---|---|
| 1. Giao diện | Chỉ tệp HTML/JS/CSS tĩnh. **Không giữ dữ liệu người dân** | Vercel | Vercel (Phần A) |
| 2. Máy chủ | Mã xử lý, các khoá bí mật (`JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER`…) | Render | Viettel Cloud (Phần B) |
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

## Phần A — Đưa giao diện lên Vercel

### A0. Cần có trước

- Tài khoản GitHub chứa mã nguồn (kho `ans-complete`, nhánh `master`).
- Địa chỉ máy chủ (backend) đang chạy. Lúc này là địa chỉ Render; sau khi làm Phần B thì đổi
  sang địa chỉ Viettel.

> **Về gói miễn phí của Vercel:** gói **Hobby** (miễn phí) theo điều khoản của Vercel chỉ dành
> cho **mục đích cá nhân, phi thương mại**. Trang chính thức của một đơn vị không phải dự án cá
> nhân, nên đơn vị cân nhắc gói **Pro** (trả phí theo tháng, tính theo người dùng). Cách thay thế
> Vercel: xem [mục A9](#a9-không-muốn-dùng-vercel).

### A1. Tạo tài khoản

1. Vào **vercel.com** → bấm **Sign Up**.
2. Chọn loại gói (**Hobby** hoặc **Pro**) → đặt tên.
3. Bấm **Continue with GitHub** → đăng nhập GitHub → bấm **Authorize Vercel**.

### A2. Nhập dự án từ GitHub

1. Trong trang Vercel, bấm **Add New…** → **Project**.
2. Ở mục **Import Git Repository**, tìm `ans-complete` → bấm **Import**.
   - **Không thấy kho?** Bấm **Adjust GitHub App Permissions** → chọn kho `ans-complete` →
     **Save** → quay lại Vercel.

### A3. Khai cấu hình dựng

Trang **Configure Project** hiện ra. Kiểm từng ô:

| Ô | Giá trị | Ghi chú |
|---|---|---|
| Framework Preset | **Vite** | Vercel thường tự nhận ra |
| Root Directory | **`./`** (thư mục gốc) | **Không** chọn `server` — `server` là máy chủ, không đưa lên Vercel |
| Build Command | `npm run build` | Mở **Build and Output Settings** để xem |
| Output Directory | `dist` | |
| Install Command | để mặc định | |

### A4. Khai biến môi trường

Vẫn ở trang đó, mở **Environment Variables**. Mỗi biến gõ **Key** và **Value** rồi bấm **Add**:

| Key | Value | Bắt buộc |
|---|---|---|
| `VITE_API_URL` | Địa chỉ máy chủ công khai, **không có `/` ở cuối**. Vd: `https://api.ten-mien.vn` | Có |
| `VITE_ADMIN_API_URL` | Địa chỉ máy chủ cán bộ, vd `https://canbo-api.ten-mien.vn`. Để trống thì trang cán bộ dùng chung `VITE_API_URL` | Khi tách hai máy chủ |
| `VITE_TURNSTILE_SITE_KEY` | Khoá **công khai** (site key) Cloudflare Turnstile | Nên có |
| `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_PRESET` | Xem Phần D. **Để trống** nếu không dùng Cloudinary | Không |

> ⚠️ **Chỉ những biến bắt đầu bằng `VITE_` mới được khai ở Vercel**, và chỉ những biến trong
> bảng trên. Mọi biến `VITE_*` bị nhúng thẳng vào tệp JavaScript, ai mở trình duyệt cũng đọc
> được. **Không bao giờ** khai `JWT_SECRET`, `ENCRYPTION_KEY`, mật khẩu CSDL, khoá Gemini, khoá
> Cloudinary bí mật… ở Vercel. Những thứ đó chỉ nằm ở máy chủ (Phần B).

### A5. Bấm Deploy

1. Bấm **Deploy**, đợi 1–3 phút.
2. Thấy pháo giấy **Congratulations** là xong → bấm **Continue to Dashboard** → **Visit**.
3. Trang có địa chỉ dạng `ten-du-an.vercel.app`.

### A6. Nối giao diện với máy chủ — 3 việc, thiếu một là hỏng

**(1) Máy chủ phải cho phép địa chỉ giao diện (CORS).** Ở máy chủ (Render bây giờ, Viettel sau
này), khai địa chỉ giao diện **chính xác**: có `https://`, không có `/` ở cuối.

| Máy chủ | Biến | Giá trị |
|---|---|---|
| Công khai | `CORS_ORIGIN`, `CLIENT_URL` | `https://ten-du-an.vercel.app` (hoặc tên miền riêng) |
| Cán bộ | `CORS_ORIGIN` | như trên |

Nhiều địa chỉ thì ghi cách nhau bằng dấu phẩy, vd `https://www.ten-mien.vn,https://ten-du-an.vercel.app`
(`CLIENT_URL` chỉ ghi một địa chỉ — địa chỉ chính).

**(2) Giao diện phải được phép gọi máy chủ (CSP).** Tệp `vercel.json` có dòng
`Content-Security-Policy` liệt kê địa chỉ máy chủ được gọi tới, hiện là
`https://hop-thu-so-v2.onrender.com`. **Đổi máy chủ là phải sửa dòng này**, không thì trình duyệt
chặn mọi lời gọi. Sửa ở **hai tệp, giống hệt nhau**:

- `vercel.json` (Vercel đọc tệp này)
- `public/_headers` (bản dành cho Netlify — giữ khớp, có test kiểm)

Trong cả hai tệp, thay **mọi chỗ** `https://hop-thu-so-v2.onrender.com` (ở `connect-src` và
`media-src`) bằng địa chỉ máy chủ mới. Nếu tách hai máy chủ thì ghi cả hai, cách nhau một dấu
cách: `https://api.ten-mien.vn https://canbo-api.ten-mien.vn`. Sửa xong thì commit, đẩy lên
`master`, Vercel tự dựng lại. *(Muốn chắc ăn: gửi tên miền cho Claude để sửa trong một phiên,
có chạy test kèm.)*

**(3) Turnstile phải biết tên miền mới.** Vào **dash.cloudflare.com** → **Turnstile** → chọn
site → **Hostname Management** → thêm `ten-du-an.vercel.app` và tên miền riêng (nếu có). Thiếu
bước này, ô "Tôi không phải máy" báo lỗi và người dân không gửi được ý kiến.

### A7. Gắn tên miền riêng (nên làm)

**Nên đặt giao diện và máy chủ chung một tên miền gốc**: giao diện `www.ten-mien.vn`, máy chủ
`api.ten-mien.vn` và `canbo-api.ten-mien.vn`. Vé giữ đăng nhập của cán bộ (cookie) được đặt chế
độ `SameSite=Lax`: trình duyệt chỉ gửi vé này khi giao diện và máy chủ **cùng tên miền gốc**. Để
giao diện ở `ten-du-an.vercel.app` còn máy chủ ở `ten-mien.vn` thì vé không được gửi, và cán bộ
phải đăng nhập lại thường xuyên hơn.

1. Trong dự án Vercel: **Settings** → **Domains** → gõ tên miền (vd `www.ten-mien.vn`) → **Add**.
2. Vercel hiện **bản ghi DNS cần thêm** (loại A hoặc CNAME). **Chép đúng y nguyên giá trị Vercel
   hiện** — không chép từ hướng dẫn trên mạng, vì Vercel có lúc đổi giá trị.
3. Vào trang quản lý tên miền ở nơi anh mua tên miền → **Quản lý DNS** → thêm bản ghi đó.
4. Đợi vài phút đến vài giờ, đến khi Vercel báo **Valid Configuration**. HTTPS được cấp tự động.
5. Thêm tên miền mới vào `CORS_ORIGIN` (A6-1) và Turnstile (A6-3).

### A8. Dùng hằng ngày

| Việc | Làm thế nào |
|---|---|
| Đưa bản mới lên | Đẩy mã lên `master` → Vercel tự dựng, 1–3 phút sau là có |
| Đổi biến môi trường | **Settings** → **Environment Variables** → sửa → rồi **bắt buộc dựng lại**: **Deployments** → bấm `⋯` ở bản mới nhất → **Redeploy**. Biến `VITE_*` được nhúng lúc dựng, sửa mà không dựng lại thì không có tác dụng |
| Quay về bản cũ khi bản mới hỏng | **Deployments** → chọn bản cũ còn tốt → `⋯` → **Promote to Production** (hoặc **Instant Rollback**) |
| Chỉ nhánh `master` lên trang chính | **Settings** → **Git** → **Production Branch** = `master` |
| Bản thử của các nhánh khác | Vercel tạo địa chỉ "Preview" cho mỗi nhánh. Kiểm **Settings** → **Deployment Protection** đang bật để người ngoài không mở được |

**Lỗi hay gặp:**

| Thấy gì | Vì sao | Sửa |
|---|---|---|
| Dựng hỏng, báo `Rollup failed to resolve import "@fontsource/..."` | Thiếu `package.json` hoặc `package-lock.json` mới trên GitHub | Đẩy đủ hai tệp đó lên |
| Trang báo **"Chưa cấu hình địa chỉ máy chủ"** | Thiếu `VITE_API_URL` | Khai biến (A4) rồi **Redeploy** |
| Bấm F12 → Console thấy `violates the following Content Security Policy directive: "connect-src ..."` | CSP chưa có địa chỉ máy chủ mới | Sửa hai tệp ở A6-2 |
| Console thấy `blocked by CORS policy` | `CORS_ORIGIN` ở máy chủ sai (thừa `/`, thiếu `https`, sai tên) | Sửa biến ở máy chủ rồi khởi động lại máy chủ |
| Ô Turnstile báo lỗi tên miền | Chưa thêm hostname | A6-3 |
| Mở thẳng `/quan-tri` báo 404 | `vercel.json` không nằm ở thư mục gốc | Kiểm lại Root Directory = `./` |

### A9. Không muốn dùng Vercel

Giao diện chỉ là thư mục `dist/` gồm tệp tĩnh, nên máy chủ Viettel ở Phần B phục vụ luôn được
(Nginx đọc thẳng thư mục `dist/`). Lợi: mọi thứ nằm ở Việt Nam, không vướng điều khoản gói
Hobby. Phải làm thêm: chép các header bảo mật trong `vercel.json` sang cấu hình Nginx. Việc chép
này nên làm trong một phiên Claude có kiểm, vì sai header là mất lớp bảo vệ mà không ai thấy.

---

## Phần B — Dựng máy chủ trên Viettel Cloud (thay Render)

Render tự lo hết: HTTPS, tự khởi động lại, tường lửa. Trên máy chủ ảo (VPS) của Viettel,
**anh phải tự làm những việc đó**. Phần này hướng dẫn từng việc.

### B1. Hỏi Viettel trước khi mua

- [ ] Gói **Cloud Server** chạy **Ubuntu 24.04 LTS**, có **1 địa chỉ IP công khai cố định**.
- [ ] Cấu hình: tối thiểu **2 vCPU, 2 GB RAM, 40 GB SSD**. Muốn máy tự đọc chữ trong ảnh và PDF
      scan (OCR) thì nên **4 GB RAM**. Ít hơn thì đặt `TRICH_CHU_OCR=tat` (Word và PDF có chữ vẫn
      đọc được).
- [ ] Có **Security Group** (tường lửa ở cổng mạng) chỉnh được trong trang quản trị.
- [ ] Có **Snapshot** (chụp nguyên ổ đĩa) để quay lại khi cài hỏng.
- [ ] Đăng ký cho **cá nhân hay cơ quan**, cần giấy tờ gì.
- [ ] **Máy này nối được tới CSDL VNPT không** (xem C1). Hai nhà mạng khác nhau thì kết nối đi
      qua Internet công cộng.

### B2. Tên miền

Máy chủ cần **tên miền** để có HTTPS. Trang giao diện chạy HTTPS thì không được gọi máy chủ
HTTP thường (trình duyệt chặn).

1. Mua tên miền (vd `ten-mien.vn`) ở nhà đăng ký tên miền — dùng chung cho cả giao diện (A7).
   Cơ quan nhà nước có thể cần thủ tục tên miền `.gov.vn` — hỏi bộ phận phụ trách của đơn vị.
2. Trong trang quản lý DNS, thêm **hai bản ghi loại A**, cả hai trỏ về **IP của máy Viettel**:

| Tên (Host) | Loại | Giá trị |
|---|---|---|
| `api` | A | IP máy Viettel |
| `canbo-api` | A | IP máy Viettel |

3. Kiểm tra: trên Windows mở PowerShell, gõ `nslookup api.ten-mien.vn`. Ra đúng IP là xong.

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
**Environment** → bấm hiện giá trị từng biến. `www.ten-mien.vn` là địa chỉ giao diện (A7); chưa có
tên miền thì tạm ghi địa chỉ `….vercel.app`.

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
# Máy chủ công khai — cho người dân
server {
    listen 80;
    server_name api.ten-mien.vn;
    server_tokens off;
    # Ứng dụng nhận tối đa 32 MB mỗi yêu cầu (ảnh, tài liệu gửi kèm). Nginx mặc định chỉ 1 MB
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
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
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
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

Kiểm từ máy Windows: mở trình duyệt vào `https://api.ten-mien.vn/api/health`. Có ổ khoá và ra
một đoạn chữ dạng `{"ok":true,...,"encryption":true,...}` là xong. `"encryption":false` nghĩa là
máy chủ không nhận được `ENCRYPTION_KEY` — kiểm lại tệp `.env`.

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

1. Vercel → **Settings** → **Environment Variables** → **xoá** `VITE_CLOUDINARY_CLOUD_NAME` và
   `VITE_CLOUDINARY_PRESET` → **Redeploy**. Từ lúc này ảnh mới lưu vào CSDL.
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

| Bước | Việc | Người dân có bị gián đoạn? |
|---|---|---|
| 1 | **Phần A**: đưa giao diện lên Vercel, vẫn nối máy chủ Render cũ | Không |
| 2 | **B1–B9**: dựng máy Viettel, tạm nối **Aiven cũ** (dùng `ca.pem` của Aiven). Chạy thử bằng `curl` và trình duyệt, **chưa** đổi Vercel | Không |
| 3 | **C1–C2**: mua và tạo CSDL VNPT, thử kết nối từ máy Viettel | Không |
| 4 | **Một đêm chuyển**: C3 (chép dữ liệu) → đổi `VITE_API_URL`/`VITE_ADMIN_API_URL` trên Vercel → sửa CSP (A6-2) → đẩy `master` → kiểm 4 việc ở C3 | **Có**, khoảng 30–60 phút. Báo trước trên trang tin hoặc nhóm Zalo; việc gấp gọi 113 |
| 5 | Theo dõi 1–2 tuần. Ổn thì tắt Render (**Suspend**, rồi **Delete**) và xoá Aiven | Không |
| 6 | **Phần D** hướng 1 | Không |

### E2. Danh sách kiểm cho đêm chuyển

- [ ] BUG-033 đã vá và đã qua RETEST độc lập.
- [ ] Ba khoá `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` đã chép ra giấy/USB cất kỹ, và giống
      hệt ở `cong-khai.env`, `can-bo.env`, Render.
- [ ] Chụp Snapshot máy Viettel.
- [ ] Render đã Suspend → không còn ý kiến mới vào Aiven.
- [ ] `mysqldump` xong, số đếm hai bên bằng nhau.
- [ ] Hai máy chủ trên Viettel `active (running)`, `https://api.../api/health` có ổ khoá.
- [ ] Vercel đã đổi `VITE_API_URL` (và `VITE_ADMIN_API_URL` nếu tách), đã **Redeploy**.
- [ ] `vercel.json` và `public/_headers` đã có địa chỉ máy chủ mới.
- [ ] `CORS_ORIGIN` đúng địa chỉ giao diện; Turnstile đã có tên miền.
- [ ] Đăng nhập cán bộ được, xem danh tính hồ sơ cũ ra đúng tên, gửi thử và tra cứu được.
- [ ] Đã `shred` các tệp sao lưu trên máy.

### E3. Những thứ VẪN ở nước ngoài sau khi chuyển

Chuyển máy chủ và CSDL về Việt Nam không kéo theo các dịch vụ dưới đây. Biết để quyết định, không
phải để hoảng:

| Dịch vụ | Nhận được gì | Bỏ được không |
|---|---|---|
| **Vercel** (giao diện) | Tệp tĩnh; thấy IP người mở trang | Được — A9 |
| **Cloudflare Turnstile** (chống máy tự động) | IP và trình duyệt người dân lúc gửi ý kiến | Khó — đây là lớp chống spam chính |
| **Google Gemini** (trợ lý hỏi đáp) | Những gì người dân gõ vào **ô trợ lý** (không phải nội dung ý kiến gửi đi — phân loại ý kiến chạy bằng quy tắc ngay trên máy chủ) | Được — để trống `GEMINI_API_KEY` thì tắt trợ lý |
| **Brevo** (gửi email mã xác thực) | Địa chỉ email người nhận | Được — đổi nhà gửi mail |
| **Open-Meteo** (dự báo mưa) | Chỉ toạ độ của phường, do máy chủ gọi | Không cần bỏ |
| **OpenStreetMap** (nền bản đồ) | IP người xem bản đồ | Được — cần phiên riêng |

Câu hỏi "dữ liệu phải ở trong nước tới mức nào" là câu hỏi pháp lý và nghiệp vụ, không phải kỹ
thuật: nên hỏi bộ phận phụ trách an ninh mạng hoặc pháp chế của đơn vị.

---

## Nguồn tham khảo (tra ngày 2026-10-06)

- Điều khoản gói Hobby của Vercel: <https://vercel.com/docs/plans/hobby>, <https://vercel.com/docs/limits/fair-use-guidelines>
- VNPT MySQL (DBaaS): <https://cloud.vnpt.vn/dich-vu/my-sql>, <https://cloud.vnpt.vn/dich-vu/cloud-database>
- Viettel Cloud Server, Object Storage của Viettel IDC: <https://viettelcloud.vn>, <https://cloudian.com/press/viettel-idc-chooses-cloudian-object-storage-as-foundation-for-service-offerings.md>
- Bizfly Cloud Simple Storage: <https://bizflycloud.vn/en/s3-simple-storage>
- VNG Cloud vStorage: <https://docs.vngcloud.vn/vng-cloud-document/vn/vstorage/object-storage>
