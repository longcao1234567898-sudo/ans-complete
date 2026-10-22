# Sổ tay triển khai — từng bước, cho người không biết lập trình

Sổ tay này dẫn đi **từ lúc thuê dịch vụ tới lúc trang chạy thật**, rồi các việc phải làm định kỳ.
Mỗi bước ghi: **làm gì · bấm/gõ gì · thấy gì là đúng · sai thì làm gì**.

Các khối lệnh dài (tệp cấu hình) nằm ở [HUONG-DAN-TRIEN-KHAI.md](HUONG-DAN-TRIEN-KHAI.md) — gọi tắt
là **"tài liệu kỹ thuật"**. Sổ tay ghi đúng tên mục để mở ra chép (ví dụ "tài liệu kỹ thuật, mục B8").

> **Phương án đã chốt (2026-10-20):** mọi thứ ở **Viettel** — máy chủ **Cloud Server gói CS1** (chạy
> giao diện + máy chủ người dân + máy chủ cán bộ) và kho dữ liệu **Viettel Database Service (vDBS)**
> gói **T2.VDBS 1 Standalone, MySQL 8.0**, nối với nhau bằng **mạng nội bộ (Private Access)**. Bản sao
> lưu mã hoá gửi sang **Bizfly** (nhà khác). Không dùng Vercel, Render, Aiven, VNPT.

---

## Trước khi bắt đầu — 5 quy tắc

1. **Không bao giờ** gửi cho ai (kể cả Claude): mật khẩu, **ba khoá bí mật**, nội dung tệp `.env`.
   Cần nhờ xem màn hình thì **che** những thứ đó trước khi chụp.
2. Chép lệnh **nguyên dòng**. Thấy chữ đỏ, chữ `error`, `failed`, `denied` → **dừng**, chụp màn hình
   gửi Claude. Đừng đoán.
3. Làm **từng chặng**, xong chặng nào đánh dấu ☑ chặng đó. Dừng giữa chừng được.
4. Chỗ nào viết `ten-mien.vn` → thay bằng **tên miền thật** của đơn vị. `IP-MAY-VIETTEL` → dãy số
   địa chỉ máy. `DIA-CHI-KHO` → địa chỉ riêng của kho vDBS.
5. **Trang đang chạy cũ (Netlify/Vercel + Render + Aiven) vẫn phục vụ người dân** tới tận đêm chuyển
   (chặng 13). Mọi việc trước đó làm thoải mái, không ảnh hưởng ai.

### Ba thao tác dùng suốt sổ tay

| Thao tác | Cách làm |
|---|---|
| **Mở cửa sổ gõ lệnh** trên máy Windows | Bấm **Start** → gõ `PowerShell` → bấm mở |
| **Dán** chữ đã chép vào cửa sổ đó | Bấm **chuột phải** (không phải Ctrl+V) |
| **Sửa một tệp** bằng `nano` (trình sửa chữ trên máy Viettel) | Dán nội dung → **Ctrl+O**, **Enter** (lưu) → **Ctrl+X** (thoát) |

---

## Chặng 0 — Chuẩn bị (làm ở cơ quan, chưa cần máy)

- [ ] **Ba khoá bí mật** đang dùng: vào Render → dịch vụ máy chủ → **Environment** → bấm hiện giá
      trị `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` → chép ra **giấy và 2 USB**, cất tủ có khoá.
      ⚠️ `ENCRYPTION_KEY` sai một ký tự là **mất vĩnh viễn toàn bộ danh tính đã lưu**.
- [ ] Chép thêm (cùng chỗ) các giá trị còn lại trong Render Environment: `TURNSTILE_SECRET_KEY`,
      `GEMINI_*`, `BREVO_API_KEY`, `MAIL_USER`, `CLOUDINARY_*`, thông tin CSDL Aiven (`DB_HOST`,
      `DB_PORT`, `DB_USER`, `DB_PASSWORD`).
- [ ] Vào được: tài khoản **GitHub** (kho `ans-complete`), **Cloudflare** (Turnstile), **Aiven**,
      **trang quản lý tên miền** (nơi đã mua tên miền).
- [ ] Một **máy tính Windows** ở cơ quan để làm việc.
- [ ] Hỏi Claude: **BUG-033 đã xử lý chưa** (phải xong trước đêm chuyển — chặng 13).

**Xong khi:** đánh dấu đủ 5 ô.

---

## Chặng 1 — Thuê dịch vụ Viettel

1. Đăng ký **Cloud Server gói CS1** (2 vCPU, 4 GB RAM) + **mua thêm 30 GB ổ** (tổng 50 GB).
   Hệ điều hành chọn **Ubuntu 24.04**. Chọn khu vực (Hà Nội hoặc TP.HCM) — **nhớ khu vực này**.
2. Đăng ký **vDBS gói T2.VDBS 1 Standalone**, **MySQL 8.0**, kiểu truy cập **Private Access**,
   **cùng khu vực và cùng mạng (VPC)** với máy CS1. Đặt **mật khẩu root của kho**: dài, chỉ chữ và số.
   (Có nút **Dùng thử** — dùng thử trước, chạy xong chặng 6 rồi mới trả tiền.)
3. Trên trang quản trị vDBS: **Actions → Connect To Other Subnet** → chọn mạng con (subnet) của máy
   CS1. Việc này mở đường nội bộ và tự đặt tường lửa chỉ cho máy CS1 vào kho.
4. Trong vDBS, phần **sao lưu tự động**: bật, **hằng ngày**, giờ **01:00**, giữ **14 bản**.
5. Ghi lại vào giấy (cất cùng ba khoá):

| Ghi lại | Lấy ở đâu |
|---|---|
| `IP-MAY-VIETTEL` | Trang quản trị máy CS1 (4 cụm số, vd `103.45.67.89`) |
| Mật khẩu root máy CS1 | Viettel gửi khi tạo máy |
| `DIA-CHI-KHO` | Trang quản trị vDBS — địa chỉ **riêng (private host)** |
| Cổng kho | Thường là `3306` |
| Mật khẩu root kho | Tự đặt ở bước 2 |

**Xong khi:** máy CS1 và kho vDBS đều ở trạng thái **Active / Đang chạy**, đã ghi đủ bảng trên.

---

## Chặng 2 — Tên miền cho hai máy chủ

Vào **trang quản lý tên miền** → **Quản lý DNS** → thêm 2 dòng:

| Tên (Host) | Loại | Giá trị |
|---|---|---|
| `api` | A | `IP-MAY-VIETTEL` |
| `canbo-api` | A | `IP-MAY-VIETTEL` |

⚠️ **Chưa đổi** hai dòng `@` và `www` (đang trỏ về trang cũ) — đổi ở đêm chuyển.

**Đúng khi:** trong PowerShell gõ `nslookup api.ten-mien.vn` ra đúng `IP-MAY-VIETTEL` (có thể
phải chờ 5–60 phút).

---

## Chặng 3 — Vào máy Viettel và khoá cửa

Làm theo **tài liệu kỹ thuật, mục B3**. Tóm tắt:

```
ssh root@IP-MAY-VIETTEL
```

- Hỏi `Are you sure...` → gõ `yes`. Gõ mật khẩu root (không hiện chữ là bình thường).
- **Đúng khi:** dòng cuối có dạng `root@...:~#`.
- Rồi làm tiếp phần **"Đổi sang đăng nhập bằng khoá"** trong B3: tạo khoá trên Windows, dán vào máy,
  **mở cửa sổ mới thử vào được không cần mật khẩu**, rồi mới tắt đăng nhập bằng mật khẩu.

⚠️ Giữ cửa sổ cũ mở tới khi cửa sổ mới vào được. Lỡ tự khoá mình ngoài → vào bằng nút **Console**
trên trang quản trị Viettel.

---

## Chặng 4 — Tường lửa

Chép nguyên khối lệnh ở **tài liệu kỹ thuật, mục B4**. Khi hỏi `Proceed with operation (y|n)?`
gõ `y`.

**Đúng khi:** lệnh cuối `ufw status` hiện đúng ba cổng **22, 80, 443** (OpenSSH, 80/tcp, 443/tcp).

Trên trang quản trị Viettel, phần **Security Group** của máy CS1: chỉ cho vào cổng **22, 80, 443**.
⚠️ **Không mở 4000, 4001, 3306.**

---

## Chặng 5 — Cài phần mềm

Chép nguyên khối lệnh ở **tài liệu kỹ thuật, mục B5**. Màn hình hồng/xanh hỏi tự cập nhật → chọn
**Yes**. Mất 3–10 phút.

**Đúng khi:** `node -v` ra `v22...`.

---

## Chặng 6 — Kiểm 3 điều của kho vDBS (VIỆC CHỜ đã ghi)

Làm đúng **tài liệu kỹ thuật, Phụ lục "VIỆC CHỜ"**: ba lệnh, mỗi lệnh hỏi mật khẩu root của kho.

| Kiểm | Ghi lại kết quả |
|---|---|
| 1. Kho có mã hoá đường nối không | ☐ Có  ☐ Không |
| 2. Cấp được quyền `SHOW_ROUTINE` không | ☐ Được  ☐ `Access denied` |
| 3. `log_bin_trust_function_creators` | ☐ `ON`  ☐ `OFF` → đã bật được  ☐ Không bật được |

**Gửi Claude ảnh chụp kết quả** (che mật khẩu nếu có). Kiểm 3 ra "không bật được" thì **dừng**,
chưa trả tiền vDBS — Claude sẽ đưa cách khác.

---

## Chặng 7 — Lấy mã nguồn về máy

Làm theo **tài liệu kỹ thuật, mục B6**:

1. Chạy hai lệnh đầu → máy in ra một dòng dài bắt đầu bằng `ssh-ed25519` → bôi đen, chép.
2. Trên **GitHub** → kho `ans-complete` → **Settings** → **Deploy keys** → **Add deploy key** → đặt
   tên `may-chu-viettel`, dán dòng vừa chép → **KHÔNG tích** *Allow write access* → **Add key**.
3. Chạy các lệnh còn lại của B6.

**Đúng khi:** lệnh `npm ci` chạy xong, không có dòng `ERR!`.

---

## Chặng 8 — Tệp cấu hình bí mật

Làm theo **tài liệu kỹ thuật, mục B7**: tạo 2 tệp `cong-khai.env` và `can-bo.env`.

Chỗ khác so với B7 (vì kho ở Viettel):

| Dòng | Ghi gì |
|---|---|
| `DB_HOST` | `DIA-CHI-KHO` |
| `DB_PORT` | Cổng kho (thường `3306`) |
| `DB_USER` | `root` |
| `DB_PASSWORD` | Mật khẩu root kho |
| `DB_SSL_CA` | Chặng 6 kiểm 1 ra **Có** → giữ dòng, dán tệp CA Viettel cấp vào `/etc/hop-thu/ca-db.pem`. Ra **Không** → **xoá hẳn dòng này** |
| Ba khoá, `TURNSTILE_*`, `GEMINI_*`, `BREVO_*`, `MAIL_USER`, `CLOUDINARY_*` | Chép y nguyên từ giấy ở chặng 0 |
| `CORS_ORIGIN`, `CLIENT_URL` | `https://www.ten-mien.vn` |
| `TRICH_CHU_OCR` | Để trống (máy 4 GB đọc chữ được) |

Cuối B7 có lệnh `chmod` khoá quyền tệp — **bắt buộc chạy**.

**Đúng khi:** ba khoá ở hai tệp **giống hệt nhau** (so từng ký tự trên giấy).

---

## Chặng 9 — Tổng duyệt: chép thử dữ liệu từ Aiven sang vDBS

Chép thử một lần để chắc đường đi thông, **trang cũ vẫn chạy bình thường** (chưa tắt Render).

Làm theo **tài liệu kỹ thuật, mục C3**, **bỏ bước 1** (không tắt Render) và **bỏ bước 7**:
- Mọi chỗ ghi `HOST-VNPT`, `PORT-VNPT`, `USER-VNPT` → thay bằng `DIA-CHI-KHO`, cổng kho, `root`.
- Chặng 6 kiểm 1 ra **Không** mã hoá → **xoá** hai tham số `--ssl-ca=/root/ca-vnpt.pem` và
  `--ssl-mode=VERIFY_IDENTITY` khỏi các lệnh **nhắm vào vDBS** (giữ nguyên ở lệnh nhắm vào Aiven).

**Đúng khi:** bước 6 (đối chiếu) ra **bốn số bằng nhau** ở Aiven và vDBS.

❌ Lỗi `ERROR 1419` → tham số chặng 6 kiểm 3 chưa bật. Lỗi khác → xem bảng lỗi cuối mục C3.

Xong thì xoá bản sao trên máy:

```bash
shred -u /root/sao-luu-aiven.sql /root/sao-luu-sach.sql
```

---

## Chặng 10 — Cho hai máy chủ tự chạy

Làm theo **tài liệu kỹ thuật, mục B8**: tạo 2 tệp, rồi chạy khối "Bật và kiểm".

**Đúng khi:**
- `systemctl status ...` hiện chữ xanh **active (running)** ở cả hai (bấm `q` để thoát).
- Hai lệnh `curl ...4000/api/health` và `curl ...4001/api/health` đều ra chữ có `"ok":true`.

❌ Không chạy → `journalctl -u hop-thu-cong-khai -n 50`, chụp gửi Claude (**che** dòng nào có khoá).

---

## Chặng 11 — Nginx và ổ khoá HTTPS cho hai máy chủ

Làm theo **tài liệu kỹ thuật, mục B9**. Trong khối cấu hình, thay **cả hai chỗ** `ten-mien.vn`.

- `nginx -t` phải ra **syntax is ok** và **test is successful**.
- Lệnh `certbot`: nhập email cơ quan, gõ `Y`, được hỏi chuyển sang HTTPS thì chọn **chuyển**.

**Đúng khi:** trên máy Windows mở trình duyệt vào `https://api.ten-mien.vn/api/health` → **có ổ
khoá**, ra chữ có `"encryption":true`.

❌ `"encryption":false` → `ENCRYPTION_KEY` trong tệp `.env` sai/thiếu. Sửa, rồi
`systemctl restart hop-thu-cong-khai hop-thu-can-bo`.

---

## Chặng 12 — Dựng giao diện trên máy (chưa đổi tên miền)

Làm theo **tài liệu kỹ thuật, Phần F**, các mục **F3, F4, F5** — **bỏ qua F2** (máy 4 GB không cần):

1. **F3** — tệp `giao-dien.env`: hai dòng `VITE_API_URL=https://api.ten-mien.vn` và
   `VITE_ADMIN_API_URL=https://canbo-api.ten-mien.vn`.
2. **F4** — chạy kịch bản dựng. **Đúng khi:** thấy `✅ Đã đưa lên`.
3. **F5** — chạy **4 dòng đầu**, tới hết dòng `nginx -t && systemctl reload nginx` (chép cấu hình,
   đổi tên miền, bật, kiểm). Ở dòng `sed`, thay `congan-phuong.vn` bằng tên miền thật.
   **Chưa chạy `certbot`** ở F5 — để đêm chuyển (vì `www` còn trỏ trang cũ).

---

## Chặng 13 — ĐÊM CHUYỂN (30–60 phút người dân không gửi được)

**Trước 1–2 ngày:** báo trên trang tin / nhóm Zalo khu phố giờ tạm dừng; việc gấp gọi 113.
**Chọn giờ vắng** (vd 23 giờ). **Trên trang quản trị Viettel: chụp Snapshot máy CS1.**

Kiểm trước khi bắt đầu:
- [ ] Claude đã xác nhận BUG-033 xử lý xong.
- [ ] Ba khoá trên giấy khớp ba khoá trong hai tệp `.env`.

Làm theo thứ tự:

1. **Tắt nhận ý kiến ở trang cũ:** Render → từng dịch vụ → **Settings → Suspend**.
2. **Chép dữ liệu thật lần cuối:** làm lại **chặng 9**, nhưng trước bước 5 của C3 phải **xoá bản
   tổng duyệt** trên vDBS (⚠️ kiểm kỹ địa chỉ là `DIA-CHI-KHO`, **không** phải Aiven):
   ```bash
   mysql --host=DIA-CHI-KHO --user=root -p -e "DROP DATABASE hop_thu_an_ninh_so"
   ```
   (Kho có mã hoá — chặng 6 kiểm 1 ra **Có** — thì thêm `--ssl-ca=/etc/hop-thu/ca-db.pem` như các
   lệnh khác.)
   Rồi làm tiếp bước 5, 6 của C3. **Đúng khi:** đối chiếu bốn số bằng nhau.
3. `systemctl restart hop-thu-cong-khai hop-thu-can-bo`
4. **Đổi tên miền:** trang quản lý tên miền → sửa `@` và `www` sang **A → `IP-MAY-VIETTEL`**.
   Chờ tới khi `nslookup www.ten-mien.vn` ra IP Viettel (5–60 phút).
5. **Ổ khoá cho trang chính:** chạy dòng `certbot --nginx -d ten-mien.vn -d www.ten-mien.vn`
   (tài liệu kỹ thuật, cuối F5).
6. **Nối giao diện với máy chủ:** **tài liệu kỹ thuật, F6** — thêm `www.ten-mien.vn` vào Turnstile
   (Cloudflare → Turnstile → Hostname Management).
7. **Kiểm đủ 4 việc** (tài liệu kỹ thuật, cuối C3):
   - [ ] Cán bộ đăng nhập được.
   - [ ] Mở một hồ sơ cũ, xem danh tính → **ra đúng họ tên**. Ra `[Dữ liệu hỏng hoặc sai khoá]` →
         **dừng, chép lại `ENCRYPTION_KEY` cho đúng**. Không xoá Aiven.
   - [ ] Gửi thử một ý kiến từ điện thoại → thấy ở trang cán bộ.
   - [ ] Tra cứu bằng mã vừa nhận → ra đúng trạng thái.
8. Xoá bản sao trên máy: `shred -u /root/sao-luu-aiven.sql /root/sao-luu-sach.sql`

**Đêm chuyển xong khi:** đủ 4 dấu ☑ ở bước 7.

---

## Chặng 14 — Sao lưu mã hoá sang Bizfly (trong 1–2 ngày sau đêm chuyển)

Làm theo **tài liệu kỹ thuật, Phần G**, từ G2 tới G6:

1. Bizfly: tạo bucket **riêng tư**, chọn **thành phố khác** với máy Viettel; tạo khoá truy cập.
2. Tạo **tài khoản chỉ đọc** cho sao lưu (G2 bước 2 — thay `IP-MAY-VIETTEL` bằng `%`, vì máy chủ
   vào kho qua mạng nội bộ).
3. **Trên máy tính cơ quan** (không phải máy Viettel): tạo cặp khoá mã hoá; **khoá mở chép ra 2 USB,
   cất cùng ba khoá**.
4. Trên máy Viettel: các tệp cấu hình, tệp lệnh, chạy thử bằng tay (G3) → thấy `OK hop-thu-...`.
   Trong tệp `sao-luu.cnf`: `host` = `DIA-CHI-KHO`; chặng 6 kiểm 1 ra **Không** mã hoá thì **xoá hai
   dòng** `ssl-ca=` và `ssl-mode=`.
5. Bật chạy tự động (G4).
6. **Diễn tập khôi phục (G6)** — bắt buộc lần đầu. **Đúng khi:** bốn dòng đối chiếu bằng nhau.

---

## Chặng 15 — Dọn dẹp (sau 1–2 tuần chạy ổn)

- [ ] Render → **Suspend** rồi **Delete** từng dịch vụ.
- [ ] Aiven → **Delete service** (đây là bản sao đầy đủ dữ liệu người dân — không xoá thì nằm đó mãi).
- [ ] Netlify/Vercel → xoá dự án; bỏ địa chỉ `….netlify.app`/`….vercel.app` khỏi `CORS_ORIGIN` và
      Turnstile (tài liệu kỹ thuật, F8 bước 5).
- [ ] Báo Claude: **xoá tệp cấu hình Vercel/Netlify khỏi mã nguồn** (việc ND-065).

---

## Việc định kỳ sau khi chạy thật

| Bao lâu | Việc | Ở đâu |
|---|---|---|
| Mỗi khi Claude báo "đã đẩy lên master" | **Cập nhật bản mới**: vào máy, chạy 4 dòng lệnh. Có tệp `database/nang_cap_vXX.sql` mới thì chạy vào kho trước | Tài liệu kỹ thuật **F7** (và **C4**). Trước cập nhật lớn: chụp Snapshot |
| Mỗi tuần (1 phút) | Kiểm sao lưu đêm nào cũng có dòng `OK` | Tài liệu kỹ thuật **G5** |
| Mỗi tháng | **Diễn tập khôi phục** sao lưu | Tài liệu kỹ thuật **G6** |
| Mỗi tháng | Ổ máy chủ: `df -h /` — cột `Use%` **dưới 70%** | Trên máy Viettel |
| Mỗi tháng | Dung lượng kho vDBS trên trang quản trị — **dưới 70%** (quá thì nâng lên gói T2.VDBS 2) | Trang quản trị vDBS |
| Mỗi năm | Gia hạn tên miền; gia hạn hợp đồng Viettel, Bizfly | Nhà cung cấp |

**Giai đoạn sau (chưa làm):** chuyển ảnh, tệp PDF/Word người dân gửi sang **Viettel Cloud Object
Storage** — cần **một phiên sửa mã** của Claude trước (tài liệu kỹ thuật, Phần D hướng 2).

---

## Khi gặp sự cố

| Thấy gì | Làm gì ngay |
|---|---|
| Trang không vào được | Vào máy: `systemctl status hop-thu-cong-khai hop-thu-can-bo nginx` → chụp gửi Claude |
| Bản mới lỗi giao diện | Quay về bản trước: tài liệu kỹ thuật **F9** |
| Hỏng nặng sau khi cập nhật | Trang quản trị Viettel → khôi phục **Snapshot** chụp trước khi cập nhật |
| Kho dữ liệu hỏng/mất | Khôi phục bản sao lưu của vDBS thành kho mới; nếu không có → bản sao Bizfly (G6), cần **khoá mở trên USB** |
| Nghi bị xâm nhập | **Không tắt máy, không xoá gì.** Đổi mật khẩu root kho, gọi Claude và bộ phận an ninh mạng |
