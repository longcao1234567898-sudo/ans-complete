# Kịch bản đồng hành — Claude hướng dẫn người vận hành đưa hệ thống lên Viettel

Tài liệu này là **kế hoạch làm việc giữa người vận hành và Claude** trong việc **dựng sẵn máy chủ Viettel** (một buổi, chưa thuê kho dữ liệu), **mở kho** khi sắp dùng,
rồi **bật lên** khi triển khai cho phường.
Nó không thay [SO-TAY-TRIEN-KHAI.md](SO-TAY-TRIEN-KHAI.md) (các chặng làm gì) hay
[HUONG-DAN-TRIEN-KHAI.md](HUONG-DAN-TRIEN-KHAI.md) (lệnh chép ở đâu). Nó trả lời ba câu:

1. Dựng máy chủ gồm **giai đoạn** nào, lúc chờ giữ máy thế nào, mở kho và ngày bật làm gì.
2. Sau mỗi bước, **gửi lại Claude cái gì** — và cái gì **tuyệt đối không gửi**.
3. Claude **kiểm gì trước khi cho đi tiếp**, khi nào **phải dừng**, hỏng thì **lùi về đâu**.

> Phương án: máy chủ **Viettel Cloud Server CS1** (dựng trước), kho dữ liệu **Viettel vDBS**
> (Private Access, cùng VPC — thuê sau), sao lưu mã hoá sang **Bizfly** (mở cùng lúc với kho). Trang cũ (Netlify/Vercel + Render + Aiven) **vẫn
> phục vụ người dân tới tận ngày bật** (giai đoạn 7) — buổi dựng sẵn và thời gian chờ không ảnh
> hưởng ai.

---

## 1. Cách làm việc cùng nhau

**Người vận hành gõ, Claude chỉ.** Claude không vào máy Viettel và không giữ mật khẩu nào. Mỗi
lượt chỉ làm **một bước**: Claude đưa lệnh → người vận hành chạy → dán kết quả lại → Claude đọc
và nói bước tiếp theo. Không chạy trước nhiều bước.

**Trả lời Claude bằng một trong bốn câu mở đầu**, cho nhanh:

| Viết | Nghĩa là |
|---|---|
| `XONG` + dán vài dòng cuối màn hình | Lệnh chạy hết, không thấy chữ lạ |
| `LỖI` + dán **nguyên văn** dòng lỗi | Có chữ đỏ, `error`, `failed`, `denied`, `not found` |
| `KẸT` + mô tả | Không tìm thấy nút, trang Viettel khác hướng dẫn, không biết chọn gì |
| `DỪNG` | Muốn nghỉ. Ghi lại đang ở giai đoạn nào, bước nào — làm tiếp từ đó |

**Dán chữ tốt hơn chụp ảnh.** Bôi đen chữ trong PowerShell rồi bấm chuột phải là chép được.
Chụp ảnh khi đang ở trang web của Viettel/Bizfly (chỗ không chép chữ được).

### Gửi được và KHÔNG BAO GIỜ gửi

| Gửi được cho Claude | **KHÔNG BAO GIỜ gửi** (kể cả cho Claude) — che trước khi chụp |
|---|---|
| Kết quả lệnh kiểm (`active (running)`, `"ok":true`, `8.0.x`…) | **Ba khoá** `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` |
| Dòng báo lỗi | Mọi **mật khẩu**: root máy CS1, root kho, `hop_thu_ung_dung`, `sao_luu` |
| Tên miền, địa chỉ IP, tên máy kho, tên gói đã mua | **Nội dung tệp `.env`** (`cong-khai.env`, `can-bo.env`, `sao-luu.cnf`) |
| Ảnh trang quản trị Viettel/Bizfly (đã che khoá) | `TURNSTILE_SECRET_KEY`, `GEMINI_API_KEY`, `BREVO_API_KEY`, `CLOUDINARY_API_SECRET` |
| | Khoá truy cập Bizfly (Access Key / Secret Key), tệp `khoa-sao-luu.txt` |
| | Khoá SSH riêng (tệp **không** có đuôi `.pub`) |

Tên miền, IP gửi được trong trò chuyện, nhưng Claude **không ghi chúng lên GitHub** (kho công
khai). Lỡ dán một khoá vào trò chuyện: báo ngay — coi khoá đó đã lộ, Claude hướng dẫn thay.
Riêng `ENCRYPTION_KEY` **không thay được** (thay là mất danh tính đã lưu): lỡ lộ thì báo Claude
và bộ phận an ninh mạng, đừng tự xử lý.

### Lệnh nguy hiểm — Claude đánh dấu ⚠️

Mấy lệnh dưới đây làm sai là không quay lại được. Claude sẽ ghi ⚠️ trước, và **người vận hành đọc
to địa chỉ / tên trong lệnh trước khi bấm Enter**:

| Lệnh | Vì sao nguy hiểm | Kiểm trước khi Enter |
|---|---|---|
| `DROP DATABASE` (giai đoạn 6; C3 bước 5a) | Xoá sạch kho | Địa chỉ là `DIA-CHI-KHO`, **không** phải Aiven |
| `ufw enable` (B4) | Đóng nhầm cổng 22 là tự khoá mình ngoài | Đã có dòng `ufw allow OpenSSH` |
| Tắt đăng nhập bằng mật khẩu (B3) | Khoá SSH chưa chạy là mất đường vào | Cửa sổ thứ hai đã vào được **không cần mật khẩu** |
| `shred` | Xoá tệp không khôi phục được | Đã đối chiếu bốn số bằng nhau |
| Sửa `ENCRYPTION_KEY` | Sai một ký tự là mất vĩnh viễn danh tính | So từng ký tự với giấy |
| Đổi DNS `@` / `www` | Người dân chuyển sang máy mới | Đang ở ngày bật (giai đoạn 7), đã qua bước chép dữ liệu |

---

## 2. Phiếu thông tin — in ra, điền tay, cất tủ có khoá

> Danh sách **đầy đủ từng biến** của hai tệp `.env`, giao diện, kho vDBS và sao lưu Bizfly —
> kèm cột "phải khớp với" và bảng đánh dấu dán vào note: [PHIEU-BIEN-TRIEN-KHAI.md](PHIEU-BIEN-TRIEN-KHAI.md).

Ghi **trên giấy**, không gõ vào máy tính dùng chung, không chụp gửi ai. Cột "Nhắc Claude được"
cho biết món đó có được nói trong trò chuyện không.

| Món | Ghi ở giai đoạn | Nhắc Claude được? |
|---|---|---|
| Tên miền (vd `ten-mien.vn`) | 1 | Được |
| **Giá trị DNS cũ** của `@` và `www` (đang trỏ trang cũ) — để lùi ở ngày bật | 1, ghi lại lần nữa trước ngày bật | Được |
| `IP-MAY-VIETTEL` (địa chỉ công khai CS1) | 1 | Được |
| `IP-MAY-CHU` (địa chỉ riêng CS1 trong VPC) | 1 | Được |
| Khu vực (Hà Nội / TP.HCM) của CS1 và vDBS | 1 | Được |
| `DIA-CHI-KHO`, `CONG-KHO` | 6 | Được |
| Kết quả Kiểm 1 → dòng `KHO_TLS=…` phải gõ | 6 | Được |
| Mật khẩu root máy CS1 | 1 | **Không** |
| Mật khẩu root kho vDBS | 6 | **Không** |
| Mật khẩu `hop_thu_ung_dung` | 6 | **Không** |
| Ba khoá `JWT_SECRET`, `ENCRYPTION_KEY`, `HASH_PEPPER` (+ 2 USB) | 1 | **Không** |
| Các khoá dịch vụ (Turnstile, Gemini, Brevo, Cloudinary), thông tin kho Aiven | 1 | **Không** |
| Khoá Bizfly, khoá mở bản sao (+ 2 USB) | 6 |
| Mật khẩu `sao_luu` | 6 | **Không** |

---

## 3. Quyết định trước khi bắt đầu

Người vận hành chốt bảy câu dưới đây ở giai đoạn 1. Cột cuối là đề nghị của Claude.

| # | Câu hỏi | Đề nghị |
|---|---|---|
| 1 | Ai đứng tên thuê Viettel, Bizfly: cá nhân hay cơ quan? | **Cơ quan** — dữ liệu tố giác không nên nằm trong hợp đồng của một cá nhân |
| 2 | Dùng tên miền đang có hay mua mới (`.vn` / `.gov.vn`)? | Giữ tên miền đang chạy, đỡ phải báo lại người dân |
| 3 | Cơ quan có **IP tĩnh** không? (để chỉ cho máy ở cơ quan vào trang cán bộ — `ADMIN_ALLOWED_IPS`) | Có thì khai ở giai đoạn 3; không có thì để trống, bổ sung sau |
| 4 | Ảnh bằng chứng: giữ Cloudinary hay chuyển? | **Giữ Cloudinary** lần này; chuyển sau (Phần D) — một lần chỉ đổi một thứ |
| 5 | Lúc chờ: để máy chạy hay tắt (Stop)? | Theo giá Viettel (câu b ở giai đoạn 1): tắt mà hết tính tiền thì tắt |
| 6 | Ngày bật: ai báo người dân giờ đổi máy? | Tối ngày thường, đổi máy từ 22:00; báo trước 1–2 ngày |
| 7 | Ai cầm USB khoá, ai giữ phiếu thông tin? | Hai người khác nhau, cùng biết chỗ cất |

---

## 4. Lộ trình — MÁY CHỦ trước, KHO DỮ LIỆU sau, BẬT khi cần

Người vận hành chốt: **bây giờ chỉ dựng máy chủ Viettel CS1**. Kho dữ liệu **vDBS chưa thuê**.
Máy chủ dựng xong để ở **chế độ chờ**; khi sắp triển khai cho phường thì **mở kho**, rồi **bật**.

| Giai đoạn | Việc | Khi nào | Thời gian | Người dân bị ảnh hưởng |
|---|---|---|---|---|
| **1** | Chuẩn bị: khoá, hỏi Viettel, **thuê máy CS1** (chưa thuê vDBS), DNS `api.` | Trước buổi dựng 3–7 ngày | rải rác | Không |
| **2–4** | **Buổi dựng máy chủ**: vào máy, khoá cửa, cài phần mềm, mã nguồn, tệp cấu hình, chạy thử máy chủ, HTTPS, giao diện | Một buổi | 3–4 giờ | Không — trang cũ vẫn chạy |
| **5** | **Chế độ chờ**: tắt máy chủ, chụp Snapshot; kiểm hằng tháng | Cuối buổi dựng → tới lúc mở kho | 15 phút + 10 phút/tháng | Không |
| **6** | **Mở kho**: thuê vDBS, kiểm kho, nối máy chủ, chép thử dữ liệu, cài sao lưu Bizfly | Vài ngày trước ngày bật | 3 giờ | Không |
| **7** | **NGÀY BẬT**: cập nhật mã, chép dữ liệu thật, đổi tên miền | Khi triển khai cho phường | 1,5–2 giờ (tối) | **Có**, 30–60 phút |
| **8** | Dọn dẹp: xoá Aiven, Render, Netlify/Vercel | 1–2 tuần sau ngày bật | 30 phút | Không |

**Vì sao dựng máy chủ trước vẫn có ích.** Phần lâu và dễ sai nhất — khoá cửa máy, tường lửa, ba
khoá bí mật, HTTPS, giao diện — làm xong và **kiểm xong** từ bây giờ. Máy chủ chạy được khi chưa
có kho: trang `/api/health` trả `"encryption":true` (khoá đúng) và `"db":false` (chưa có kho —
đúng như dự kiến). Tới lúc mở kho chỉ còn điền mấy dòng `DB_*` và chép dữ liệu.

**Không có dữ liệu thật nào trên máy cho tới giai đoạn 6.** Máy chờ chỉ giữ mã nguồn, cấu hình và
ba khoá (tệp chỉ root đọc được). Vì vậy nên **mở kho sát ngày bật** (vài ngày trước): đỡ tiền
thuê kho, và bản chép thử dữ liệu người dân không phải nằm lâu trên kho chưa dùng.

**Chi phí khi chờ.** Máy CS1 tính tiền theo tháng dù chưa phục vụ ai. Hỏi Viettel ở giai đoạn 1:
**tắt máy (Stop) lúc chờ còn tính tiền không, giữ Snapshot tốn bao nhiêu**.

Gặp điểm dừng ở đâu thì **dừng ở đó, hôm khác làm tiếp** — chưa ai dùng máy mới. Nên có **hai
người**: một người gõ, một người đọc lại lệnh nguy hiểm và giữ phiếu.

Mỗi giai đoạn dưới đây có: **Các bước** · **Claude kiểm trước khi qua giai đoạn sau** · **Dừng
lại nếu** (và đường lùi nếu có).

---

### Giai đoạn 1 — Chuẩn bị (TRƯỚC buổi dựng máy chủ, 3–7 ngày trước)

**Cần có:** máy tính Windows, giấy in phiếu ở mục 2, 2 USB, quyền vào GitHub, Render,
Cloudflare, trang quản lý tên miền.

**Các bước:**

1. Chốt các câu ở mục 3 (câu 6 để tới gần ngày bật cũng được).
2. Làm **chặng 0** của sổ tay: chép ba khoá và các khoá dịch vụ từ Render ra giấy + 2 USB.
3. Mở trang quản lý tên miền, **chép lại giá trị hiện tại** của hai dòng `@` và `www` vào phiếu
   (đường lùi của ngày bật — trước ngày bật xem lại, đổi rồi thì ghi lại).
4. Gửi Viettel danh sách câu hỏi — **hỏi cả phần kho** dù chưa thuê, để biết trước có vướng gì
   không. Chép nguyên đoạn dưới vào email/Zalo cho nhân viên kinh doanh:

> Đơn vị cần thuê **ngay**: **Cloud Server** Ubuntu 24.04, 2 vCPU, 4 GB RAM, SSD 50 GB, 1 IP công
> khai cố định, có Security Group và Snapshot. **Sau này** sẽ thuê thêm **vDBS T2.VDBS 1
> Standalone, MySQL 8.0, Private Access** cùng VPC với máy trên. Xin hỏi:
> a) Máy chủ thuê bây giờ, vài tháng sau thuê vDBS thì có nối **Private Access cùng VPC** được
> không? Có cần chọn sẵn khu vực / VPC nào ngay từ lúc tạo máy không?
> b) Máy chủ **tắt (Stop) trong thời gian chưa dùng** thì có còn tính tiền không? Giữ
> **Snapshot** tốn bao nhiêu?
> c) vDBS có cho **dùng thử** không, bao lâu?
> d) vDBS có **mã hoá kết nối TLS** không, có cấp **tệp chứng chỉ CA** không?
> e) Tài khoản root của kho có chỉnh được tham số **`log_bin_trust_function_creators = 1`** không?
> f) Root của kho có cấp được quyền **`SHOW_ROUTINE`** cho tài khoản khác không?
> g) Kho có bật **`sql_require_primary_key`** không, tắt được không?
> h) Sao lưu tự động của vDBS: bao lâu một lần, giữ bao nhiêu bản, có khôi phục về thời điểm không?
> i) Hợp đồng cho **cơ quan** cần giấy tờ gì; xin **báo giá chính thức** cả hai dịch vụ (đã gồm VAT).

5. Viettel trả lời xong → **chặng 1 bước 1**: thuê **máy CS1** (chưa thuê vDBS — bỏ bước 2 của
   chặng 1). Chọn khu vực theo câu (a). Ghi vào phiếu: `IP-MAY-VIETTEL`, `IP-MAY-CHU`, khu vực,
   mật khẩu root máy.
6. **Chặng 2**: thêm hai dòng DNS `api`, `canbo-api`. **Không** đụng `@`, `www`.

**Claude kiểm trước buổi dựng máy chủ:**
- [ ] Ba khoá đã ở trên giấy **và** 2 USB (người vận hành xác nhận, **không** đọc khoá cho Claude).
- [ ] Đã ghi giá trị DNS cũ của `@`, `www`.
- [ ] Viettel đã trả lời câu (a). Câu (e) trả lời **"không"** → chưa sao, nhưng báo Claude: sẽ
      phải chuẩn bị cách khác trước giai đoạn 6.
- [ ] Máy CS1 ở trạng thái **Active**.
- [ ] `nslookup api.ten-mien.vn` và `nslookup canbo-api.ten-mien.vn` ra đúng `IP-MAY-VIETTEL`.

**Dừng lại nếu:** Viettel nói máy thuê trước **không nối được** với vDBS thuê sau (câu a) → chưa
thuê máy, báo Claude.

---

### Giai đoạn 2 — Vào máy, khoá cửa, cài phần mềm (chặng 3–5) · khoảng 1 giờ

**Các bước:**

1. Trang quản trị Viettel → **chụp Snapshot** máy CS1 lúc còn trống (để làm lại từ đầu nếu cần).
2. **Chặng 3** — vào máy bằng mật khẩu, đổi sang đăng nhập bằng khoá. ⚠️ giữ cửa sổ cũ mở.
3. **Chặng 4** — tường lửa trên máy (`ufw`) **và** Security Group trên trang Viettel.
4. **Chặng 5** — cài phần mềm.

**Claude kiểm trước khi qua giai đoạn 3** — dán kết quả các lệnh này:

```bash
ufw status                 # đúng ba dòng: OpenSSH, 80/tcp, 443/tcp
node -v                    # v22...
id hopthu-ck; id hopthu-cb # hai tài khoản hệ thống đã có
df -h /                    # cột Size khoảng 50G
hostname -I                # cụm số đầu = IP-MAY-CHU ghi ở phiếu
```

- [ ] Mở cửa sổ PowerShell mới, `ssh root@IP-MAY-VIETTEL` vào được **không hỏi mật khẩu**.
- [ ] Ảnh Security Group (che gì cũng được trừ danh sách cổng): chỉ **22, 80, 443**.

**Dừng lại nếu:** ổ dưới 40 GB; Security Group không chỉnh được.

**Đường lùi:** tự khoá mình ngoài → nút **Console** trên trang quản trị Viettel. Cài hỏng nặng →
khôi phục Snapshot vừa chụp ở bước 1.

---

### Giai đoạn 3 — Mã nguồn và tệp cấu hình, CHƯA có kho (chặng 7–8) · khoảng 1 giờ

**Các bước:**

1. **Chặng 7** — deploy key chỉ đọc, lấy mã nguồn.
2. **Chặng 8** — hai tệp `cong-khai.env`, `can-bo.env`, **trừ phần kho**:

| Dòng | Lúc này ghi gì |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_PASSWORD` | **Để trống** (giữ dòng, sau dấu `=` không ghi gì) — điền ở giai đoạn 6 |
| `DB_USER`, `DB_NAME` | Ghi như B7: `hop_thu_ung_dung`, `hop_thu_an_ninh_so` |
| `DB_SSL_CA` | **Chưa ghi dòng này.** Ghi dòng mà chưa có tệp CA thì máy chủ không khởi động được. Giai đoạn 6 mới biết kho có cần |
| Ba khoá, `TURNSTILE_SECRET_KEY`, các khoá dịch vụ, `HOST=127.0.0.1`, `CORS_ORIGIN`… | Ghi đủ như chặng 8 |
| `ADMIN_ALLOWED_IPS` | Câu 3 ở mục 3 có IP tĩnh → ghi vào `can-bo.env`; không thì để trống |

Ba khoá ghi **ngay bây giờ** (không đợi mở kho): để kiểm được `"encryption":true` ở giai đoạn 4,
và để đêm bật không phải gõ khoá vội. Tệp chỉ root đọc được (`chmod 600` ở cuối B7).

Người vận hành **tự gõ khoá từ giấy**; Claude chỉ nói dòng nào ghi gì. Khi xong, **không dán tệp
cho Claude** — chạy lệnh kiểm dưới, lệnh này chỉ in **tên biến**, không in giá trị:

```bash
# So hai tệp: những biến phải giống hệt nhau. Chỉ in "GIỐNG"/"KHÁC", không in khoá.
for k in JWT_SECRET ENCRYPTION_KEY HASH_PEPPER TURNSTILE_SECRET_KEY DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME HOST; do
  a=$(grep -E "^$k=" /etc/hop-thu/cong-khai.env | sha256sum); b=$(grep -E "^$k=" /etc/hop-thu/can-bo.env | sha256sum)
  [ "$a" = "$b" ] && echo "GIỐNG  $k" || echo "KHÁC   $k"
done
for f in cong-khai can-bo; do grep -cE "^(JWT_SECRET|ENCRYPTION_KEY|HASH_PEPPER|TURNSTILE_SECRET_KEY)=.+" /etc/hop-thu/$f.env; done   # mỗi tệp phải ra 4
grep -E "^(HOST|DB_USER|DB_SSL_CA)=" /etc/hop-thu/cong-khai.env /etc/hop-thu/can-bo.env
ls -l /etc/hop-thu/                                                                  # .env phải là -rw-------
```

**Claude kiểm trước khi qua giai đoạn 4:**
- [ ] Đủ mười dòng `GIỐNG`; hai dòng đếm đều ra `4` (không khoá nào bị bỏ trống).
- [ ] `HOST=127.0.0.1` ở cả hai tệp; `DB_USER=hop_thu_ung_dung` (không phải `root`).
- [ ] **Chưa có** dòng `DB_SSL_CA`.
- [ ] Hai tệp `.env` có quyền `-rw-------`.

---

### Giai đoạn 4 — Chạy thử máy chủ, HTTPS, giao diện — chưa có kho (chặng 10–12) · 1,5 giờ

**Cần có:** điện thoại có 4G để thử từ ngoài.

**Các bước:**

1. **Chặng 10** — hai máy chủ tự chạy (B8). Lúc này nhật ký **sẽ có** hai dòng đỏ
   `KHÔNG kết nối được MySQL` và `KHÔNG xoá được dấu nối quá hạn` — **bình thường**, chưa có kho.
2. **Chặng 11** — Nginx, HTTPS cho `api.` và `canbo-api.`.
3. **Chặng 12** — dựng giao diện trên máy (F3–F5, **chưa** `certbot` cho `www`).
4. **Kiểm từ ngoài vào** — trên máy Windows ở cơ quan, PowerShell:

```powershell
# Ba cổng nội bộ phải ĐÓNG từ Internet: mỗi lệnh phải ra "TcpTestSucceeded : False"
Test-NetConnection IP-MAY-VIETTEL -Port 4000
Test-NetConnection IP-MAY-VIETTEL -Port 4001
Test-NetConnection IP-MAY-VIETTEL -Port 3306
# Cổng web phải MỞ: "True"
Test-NetConnection IP-MAY-VIETTEL -Port 443
```

**Claude kiểm trước khi qua giai đoạn 5:**
- [ ] `systemctl status hop-thu-cong-khai hop-thu-can-bo`: cả hai `active (running)`.
- [ ] `https://api.ten-mien.vn/api/health` **và** `https://canbo-api.ten-mien.vn/api/health` mở
      trên điện thoại 4G: có ổ khoá, `"encryption":true`, `"db":false` (**đúng như dự kiến**).
- [ ] `journalctl -u hop-thu-can-bo -n 50` **không** có dòng đỏ `🔴 CHẶN IP CÁN BỘ CÓ THỂ BỊ LÁCH`
      hay `CHỐNG MÁY TỰ ĐỘNG ĐANG TẮT` (hai dòng đỏ về MySQL thì được).
- [ ] Ba cổng 4000, 4001, 3306 ra `False`; cổng 443 ra `True`.
- [ ] Giao diện: kịch bản dựng in `✅ Đã đưa lên`; `nginx -t` sạch.

**Dừng lại nếu:** `"encryption":false` (khoá sai/thiếu — sửa `ENCRYPTION_KEY` theo giấy); một
trong ba cổng nội bộ ra `True`. **Chưa đủ dấu thì chưa đưa về chế độ chờ** — máy chờ phải là máy
đã kiểm xong.

**Đường lùi:** chưa ai dùng máy mới — sửa thoải mái. Hỏng nặng: khôi phục Snapshot.

---

### Giai đoạn 5 — Chế độ chờ (cuối buổi dựng máy chủ, 15 phút)

**Các bước:**

```bash
# Tắt hai máy chủ và KHÔNG cho tự bật lại khi máy khởi động lại.
# Nginx vẫn chạy để chứng chỉ HTTPS của api. và canbo-api. tự gia hạn.
systemctl disable --now hop-thu-cong-khai hop-thu-can-bo
```

1. Trang quản trị Viettel → **chụp Snapshot** máy CS1, đặt tên kiểu `may-chu-cho-NGAY`.
2. Theo câu (b) Viettel trả lời: tắt máy mà **hết** tính tiền → có thể **Stop** máy (giai đoạn 6
   bật lại). Không thì để máy chạy.
3. Ghi lên phiếu: **ngày dựng xong**, bản mã nguồn đang chạy (`cd /opt/hop-thu && git log -1 --format=%h`).

Những thứ **giữ nguyên** trong lúc chờ: tệp `.env`, Nginx + chứng chỉ, giao diện đã dựng, deploy
key, tường lửa.

**Claude kiểm:**
- [ ] `systemctl is-enabled hop-thu-cong-khai hop-thu-can-bo` ra hai dòng `disabled`.
- [ ] Snapshot `may-chu-cho-…` đã có.

#### Trong lúc chờ — mỗi tháng một lần (10 phút)

Máy chờ vẫn là máy có ba khoá trên đĩa — không dùng không có nghĩa là không ai nhắm tới.

| Việc | Lệnh / chỗ xem | Đúng khi |
|---|---|---|
| Còn vào được bằng khoá | `ssh root@IP-MAY-VIETTEL` | Vào được, không hỏi mật khẩu |
| Bản vá hệ điều hành tự cài | `tail -3 /var/log/unattended-upgrades/unattended-upgrades.log` | Ngày ở đầu dòng là mấy hôm gần đây |
| Không ai lạ đăng nhập | `last -n 20` | Chỉ thấy các lần chính mình vào |
| Tường lửa còn nguyên | `ufw status` | Đúng 22, 80, 443 |
| Ổ đĩa | `df -h /` | `Use%` dưới 70% |
| Chứng chỉ HTTPS | `certbot certificates` | Còn hạn trên 30 ngày |
| Hợp đồng | Trang quản trị Viettel | Chưa hết hạn |

Máy đã **Stop** thì không cần kiểm hằng tháng — chỉ kiểm hạn hợp đồng.

---

### Giai đoạn 6 — Mở kho dữ liệu (vài ngày trước ngày bật, khoảng 3 giờ)

**Cần có:** phiếu thông tin, thông tin kho Aiven (giấy ở chặng 0), tài khoản Bizfly (mở mới), máy
tính cơ quan (tạo khoá mã hoá bản sao), 2 USB.

**A. Đánh thức máy chủ** (máy đã Stop → bật lại trên trang Viettel; chụp Snapshot trước khi làm gì):

1. Chạy bảng "mỗi tháng một lần" ở giai đoạn 5 — đủ dấu mới đi tiếp.
2. **Cập nhật mã mới nhất** (tài liệu kỹ thuật F7, **trừ** dòng `systemctl restart`):
   `git pull` → `npm ci --omit=dev` → `bash deploy/dung-giao-dien.sh` ra `✅`.
3. Máy đã Stop lâu: `certbot renew` rồi `certbot certificates` còn hạn.

**B. Thuê và kiểm kho:**

4. **Chặng 1 bước 2** — thuê vDBS (dùng thử), **cùng khu vực và VPC** với CS1. Cách tạo:
   tài liệu kỹ thuật **C2** phần "Trên trang quản trị Viettel". Ghi `DIA-CHI-KHO`, `CONG-KHO`,
   mật khẩu root kho lên phiếu.
5. **Chặng 6** — các phép kiểm kho (C2 phần "Trên máy CS1"). Ghi dòng `KHO_TLS=…` lên phiếu.
6. Tạo tài khoản `hop_thu_ung_dung` (cuối C2). Lỡ báo `Access denied …@'10.x.x.x'` sau này thì
   dùng đúng địa chỉ trong câu báo lỗi.
7. **Điền phần kho** vào **cả hai** tệp `.env`: `DB_HOST=DIA-CHI-KHO` (kho có mã hoá thì đúng tên
   trên chứng chỉ — Kiểm 1b), `DB_PORT`, `DB_PASSWORD`. Kho có mã hoá → **thêm** dòng
   `DB_SSL_CA=/etc/hop-thu/ca-db.pem` và dán tệp CA (B7). Chạy lại lệnh so `GIỐNG/KHÁC` ở giai đoạn 3.

**C. Chép thử và chạy với dữ liệu:**

8. **Chặng 9** — chép thử dữ liệu Aiven → vDBS (C3 cột "Tổng duyệt"). Trang cũ vẫn chạy.
9. Bật hai máy chủ: `systemctl enable --now hop-thu-cong-khai hop-thu-can-bo`.

**D. Sao lưu Bizfly** (trên dữ liệu chép thử):

10. **Chặng 14** — bước 1 (bucket riêng tư, thành phố khác), 2 (tài khoản `sao_luu`), 3 (khoá mã
    hoá trên máy cơ quan, khoá mở ra 2 USB), 4 (cấu hình, chạy tay G3), 5 (bật tự động G4).

**Claude kiểm:**
- [ ] Kiểm 0 ra `8.0.x`; Kiểm 3 ra `ON` (hoặc đã bật được).
- [ ] Chặng 9: bốn số đối chiếu bằng nhau.
- [ ] `https://api.ten-mien.vn/api/health`: lần này `"ok":true`, `"db":true`, `"encryption":true`.
- [ ] Nhật ký hai máy chủ **hết** dòng đỏ về MySQL.
- [ ] `sao_luu` chỉ có quyền đọc + `SHOW_ROUTINE`, gắn `IP-MAY-CHU` (không phải `%`).
- [ ] Chạy tay G3 in `OK hop-thu-….sql.gz.age`; `systemctl list-timers | grep sao-luu` có dòng.
- [ ] Đã xoá bản sao trên máy (`shred`, C3 bước 8).

**Dừng lại nếu:** Kiểm 3 không bật được; Kiểm 1b ra chứng chỉ tự sinh (`…Auto_Generated`); xem
danh tính ra `[Dữ liệu hỏng hoặc sai khoá]`; G3 báo `LOI`. Dừng ở đây không ảnh hưởng ai.

**Chưa bật ngay sau giai đoạn này?** (ngày bật còn xa hơn dự tính) — đừng để bản chép thử dữ liệu
thật nằm trên kho chưa dùng. Đưa về chờ lại:

```bash
systemctl disable --now hop-thu-cong-khai hop-thu-can-bo
systemctl disable --now hop-thu-sao-luu.timer      # kho sắp trống — để chạy thì đêm nào cũng báo LOI
# ⚠️ Nhìn kỹ: DIA-CHI-KHO, KHÔNG phải Aiven.
mysql --host=DIA-CHI-KHO --port=CONG-KHO --user=root -p $KHO_TLS -e "DROP DATABASE hop_thu_an_ninh_so"
```

Rồi xoá các tệp sao lưu chạy thử trên Bizfly (bucket, khoá giữ nguyên). Tài khoản
`hop_thu_ung_dung`, `sao_luu` và tệp `.env` giữ nguyên — ngày bật dùng tiếp.

---

### Giai đoạn 7 — NGÀY BẬT (khi triển khai cho phường, 1,5–2 giờ, buổi tối)

**Trước 1–2 ngày:** báo người dân (trang tin, nhóm Zalo khu phố): tối … từ 22:00 tạm dừng nhận ý
kiến khoảng 1 giờ; việc gấp gọi 113. **Báo Claude ngày bật** để Claude xem trước mã nguồn mới có
tệp nâng cấp CSDL hay thay đổi nào đụng tới các bước dưới không.

**A. Buổi chiều** (trang cũ vẫn chạy): mã nguồn có bản mới từ giai đoạn 6 → cập nhật (F7, trừ dòng
`systemctl restart`). Đã đưa về chờ lại ở cuối giai đoạn 6 → bật lại hai máy chủ cho tự chạy:
`systemctl enable hop-thu-cong-khai hop-thu-can-bo` (chưa chạy ngay — bước B2 sẽ chạy).

**B. Đổi máy** (giờ đã báo, vd 22:00) — theo đúng thứ tự:

1. Trang quản trị Viettel → **chụp Snapshot** máy CS1. Trang quản trị vDBS → **sao lưu thủ công**.
2. **Chặng 13 bước 1** — C3 cột "Đêm chuyển", đủ bước 1 → 8. ⚠️ bước 5a (đã xoá bản chép thử ở
   cuối giai đoạn 6 thì 5a báo "database doesn't exist" — không sao, làm tiếp).
3. **Tệp nâng cấp CSDL mới** (nếu Claude báo có `database/nang_cap_vXX.sql` mới hơn bản đang ở
   Aiven): chạy theo C4, rồi `systemctl restart hop-thu-cong-khai hop-thu-can-bo`.
4. **Dọn hồ sơ mẫu (ND-095).** Kho cũ có thể còn 4 hồ sơ mẫu `DEMO01`–`DEMO04` mang tên giả chữ
   thường. Đếm trước, rồi xoá — tệp chỉ xoá đúng hồ sơ mẫu, không đụng hồ sơ thật:

   ```bash
   mysql --host=DIA-CHI-KHO --port=CONG-KHO --user=root -p $KHO_TLS hop_thu_an_ninh_so \
     -e "SELECT tracking_code, sender_name FROM submissions WHERE tracking_code LIKE 'DEMO0%'"
   mysql --host=DIA-CHI-KHO --port=CONG-KHO --user=root -p $KHO_TLS hop_thu_an_ninh_so \
     < /opt/hop-thu/database/xoa_ho_so_mau.sql
   ```

   Lệnh đầu không ra dòng nào → kho cũ không có hồ sơ mẫu, bỏ lệnh thứ hai. Có → lệnh thứ hai in
   `so_ho_so_mau_da_xoa` bằng đúng số dòng vừa thấy. (Gửi Claude **số dòng**, không cần gửi tên.)
5. **Chặng 13 bước 2** — đổi DNS `@`, `www` sang `IP-MAY-VIETTEL`. Chờ `nslookup` ra IP mới.
6. **Chặng 13 bước 3–4** — `certbot` cho trang chính; thêm `www.ten-mien.vn` vào Turnstile.
7. **Chặng 13 bước 5** — kiểm đủ bốn việc, **bằng điện thoại 4G** (không dùng mạng cơ quan, để
   chắc người ngoài vào được).
8. **Sao lưu bản thật:** `systemctl enable --now hop-thu-sao-luu.timer`, chạy tay G3 một lần →
   `OK hop-thu-…`.
9. **Diễn tập khôi phục G6** với bản vừa chạy — làm luôn nếu còn sức; mệt thì **sáng hôm sau**,
   chậm nhất trong 1–2 ngày.

**Claude kiểm trước khi tuyên bố xong:**
- [ ] Bốn số đối chiếu bằng nhau.
- [ ] `https://api.ten-mien.vn/api/health`: `"ok":true`, `"encryption":true`; nhật ký máy chủ cán
      bộ không có dòng đỏ `🔴 CHẶN IP CÁN BỘ CÓ THỂ BỊ LÁCH` hay `CHỐNG MÁY TỰ ĐỘNG ĐANG TẮT`.
- [ ] Hồ sơ cũ xem danh tính **ra đúng họ tên** (người vận hành xác nhận "đúng" — **không** gửi tên).
- [ ] Gửi thử từ điện thoại → hiện ở trang cán bộ; tra cứu bằng mã vừa nhận ra đúng trạng thái.
- [ ] `https://www.ten-mien.vn` có ổ khoá; F12 → Console không có dòng đỏ `CORS` / `Content Security Policy`.
- [ ] Ý kiến gửi thử: cán bộ chuyển trạng thái và ghi rõ "ý kiến thử khi chuyển máy" cho khỏi lẫn với ý kiến thật.
- [ ] `Test-NetConnection` cổng 4000, 4001, 3306 vẫn ra `False` (như giai đoạn 4).
- [ ] Sao lưu bản thật có dòng `OK`; bộ hẹn giờ sao lưu `enabled`.
- [ ] (Tối nay hoặc sáng mai) **G6 diễn tập khôi phục: bốn dòng đối chiếu bằng nhau** (bảng,
      trigger, thủ tục, view). Khôi phục ra số thủ tục = 0 → thiếu `SHOW_ROUTINE`, báo Claude ngay.

**Dừng lại và LÙI nếu:** xem danh tính ra `[Dữ liệu hỏng hoặc sai khoá]` mà chép lại
`ENCRYPTION_KEY` vẫn không hết; hoặc sau 60 phút vẫn chưa gửi thử được.

**Đường lùi ngày bật** — làm theo thứ tự, mất khoảng 15 phút cộng thời gian DNS:

| Đã tới bước | Lùi thế nào |
|---|---|
| Trước bước 5 (chưa đổi DNS) | Render → từng dịch vụ → **Resume**. Người dân vẫn ở trang cũ, chưa ai thấy máy mới. Xong. |
| Sau bước 5 (đã đổi DNS) | Trang quản lý tên miền → trả `@`, `www` về **giá trị cũ trên phiếu** → Render **Resume** → `systemctl stop hop-thu-cong-khai hop-thu-can-bo` trên CS1 (để không ai gửi nhầm vào máy mới trong lúc DNS chưa cập nhật hết) |

Aiven **không bị đụng** trong ngày bật (chỉ đọc ra), nên lùi về trang cũ không mất gì — trừ ý
kiến người dân gửi vào máy mới sau bước 5. Lùi sau bước 5 thì báo Claude: Claude hướng dẫn lấy
những ý kiến đó ra từ vDBS trước khi xoá.

---

### Giai đoạn 8 — Dọn dẹp và bàn giao (chặng 15, sau 1–2 tuần chạy ổn)

**Các bước:** chặng 15 của sổ tay — xoá Render, **xoá Aiven** (bản sao đầy đủ dữ liệu người dân),
xoá dự án Netlify/Vercel, bỏ địa chỉ cũ khỏi `CORS_ORIGIN` và Turnstile.

**Claude kiểm:**
- [ ] Ảnh trang Aiven: không còn dịch vụ MySQL.
- [ ] Sao lưu tự động có dòng `OK` các đêm vừa qua (G5); G6 đã diễn tập khớp số.
- [ ] Người vận hành nắm bảng **Việc định kỳ** cuối sổ tay — Claude hỏi lại từng dòng.

Sau giai đoạn này báo Claude **xoá tệp cấu hình Vercel/Netlify khỏi mã nguồn** (ND-065) — một
phiên riêng.

---

## 5. Những điều Claude luôn kiểm, giai đoạn nào cũng vậy

Đây là các lớp bảo vệ **người tố giác** phụ thuộc vào việc cài đặt đúng. Ứng dụng đã được viết để
từ chối chạy khi thiếu khoá, nhưng mấy điều dưới đây ứng dụng không tự biết được:

| Điều | Vì sao | Kiểm bằng |
|---|---|---|
| Chỉ cổng 22, 80, 443 mở ra Internet | Cổng 4001 lộ ra là lách được chặn IP cán bộ (BUG-047); 3306 lộ ra là ai cũng dò được kho | `ufw status`, Security Group, `Test-NetConnection` |
| `HOST=127.0.0.1` ở hai tệp `.env` | Chốt thứ hai giữ cổng 4000/4001 trong máy, kể cả khi tường lửa cấu hình sai | Lệnh kiểm giai đoạn 3; nhật ký không có dòng `🔴 CHẶN IP` |
| Ba khoá giống hệt nhau ở hai tệp và giống bản ở Render | Khác nhau là cán bộ không xem được danh tính, hoặc mất vĩnh viễn | Lệnh so `GIỐNG/KHÁC` giai đoạn 3 |
| Ứng dụng dùng `hop_thu_ung_dung`, không dùng root | Root gỡ được trigger "nhật ký chỉ ghi thêm" — bị chiếm là xoá được dấu vết | `grep DB_USER` |
| `TURNSTILE_SECRET_KEY` ở **cả hai** tệp | Thiếu ở `can-bo.env` là máy tự động dò được mật khẩu cán bộ | Lệnh kiểm giai đoạn 3; nhật ký không có `CHỐNG MÁY TỰ ĐỘNG ĐANG TẮT` |
| Không bật proxy (đám mây cam) Cloudflare cho DNS | Mọi người dân chung một IP, chặn spam hỏng | Ảnh trang DNS |
| Không còn bản sao dữ liệu thô nằm lại | Bản sao có danh tính đã mã hoá và lời kể | `ls /root/*.sql` không ra gì |
| Hồ sơ mẫu đã dọn | Tên thô trong kho chạy thật (ND-095) | Giai đoạn 7, bước B4 |

---

## 6. Việc còn mở cần biết trước khi đi

| Việc | Ảnh hưởng tới triển khai |
|---|---|
| **Ba tệp Word** trong `docs/tai-lieu-word/` chưa cập nhật theo phương án vDBS + Bizfly | **Không dùng chúng để cài đặt.** Chỉ làm theo sổ tay và tài liệu kỹ thuật |
| **BUG-047** — bản vá đã có, chờ kiểm độc lập | Không chặn: hai lớp chặn (`HOST=127.0.0.1` + Security Group) đã có trong các bước và được kiểm ở giai đoạn 3, 4 |
| **ND-094** — sức ghi khi quá đông (kho nối tối đa 10 kết nối) | Không chặn ở quy mô phường. Sau khi chạy ổn, đo lại trên chính máy Viettel rồi mới chỉnh |
| **Mã nguồn đổi trong lúc chờ** (bản vá, tệp nâng cấp CSDL mới) | Giai đoạn 6 bước 2 và ngày bật bước A cập nhật mã, B3 chạy tệp nâng cấp mới — Claude xem trước khi báo ngày bật |
| **ND-066** — các phép kiểm vDBS | Làm ở giai đoạn 6; gửi Claude kết quả để đóng |
| Lệnh Phần C và G **chưa chạy trên vDBS và Bizfly thật** | Giai đoạn 6, 7 chính là lần chạy thật đầu tiên — vì vậy mới làm từng bước, có điểm dừng, và mở kho trước ngày bật vài ngày |

---

## 7. Câu gửi Claude để bắt đầu

**Buổi dựng máy chủ:**

> Bắt đầu buổi dựng máy chủ Viettel theo `docs/KICH-BAN-DONG-HANH-TRIEN-KHAI.md`. Giai đoạn 1
> đã xong: … (ô nào chưa đánh dấu thì ghi ra).

**Mở kho:**

> Mở kho dữ liệu theo `docs/KICH-BAN-DONG-HANH-TRIEN-KHAI.md` giai đoạn 6. Máy chủ dựng xong ngày …,
> đang để chạy / đã Stop. Dự định ngày bật: … .

**Ngày bật:**

> Chuẩn bị ngày bật theo `docs/KICH-BAN-DONG-HANH-TRIEN-KHAI.md` giai đoạn 7. Kho mở ngày …,
> đã / chưa đưa về chờ lại. Giờ đổi máy đã báo người dân: … .

Bị đứt giữa chừng (mất mạng, phải nghỉ) thì gửi: *"Làm tiếp, đang ở giai đoạn N bước M, kết quả
bước trước: …"* (không ghi khoá, mật khẩu).

Claude sẽ: đọc lại kịch bản và sổ tay, kiểm mã nguồn trên GitHub có bản mới nào đụng tới bước sắp
làm không (với ngày bật: có tệp `nang_cap_vXX.sql` mới không), đối chiếu mục "Claude kiểm" của giai
đoạn trước, rồi mới đưa lệnh đầu tiên.
