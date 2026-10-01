# Phụ lục D — Công cụ tự động & lệnh chạy

**Mục đích:** đối chiếu kết quả do người/AI rà soát thủ công với kết quả máy quét, để không
phụ thuộc hoàn toàn vào một nguồn. Đặc biệt quan trọng ở đây vì cả người viết code lẫn người
rà soát đều có thể là AI — hai lần cùng một loại điểm mù.

**Cách dùng kết quả:** thứ đáng chú ý nhất **không** phải là danh sách công cụ tìm ra, mà là
phần **giao nhau rỗng**: những gì công cụ tìm ra mà rà soát thủ công đã bỏ sót. Ghi lại phần
đó vào báo cáo Giai đoạn 5, mục "Bài học về việc dùng AI để fix".

---

## 1. Dependency scanning (chạy D6, và định kỳ hàng tháng)

```bash
# Thư mục gốc (frontend)
npm audit --audit-level=moderate
npm outdated

# Backend
cd server && npm audit --audit-level=moderate && npm outdated
```

Điểm cần chú ý sẵn có trong dự án:

| Gói | Vấn đề cần kiểm |
|---|---|
| `xlsx@^0.18.5` | Bản trên npm registry có CVE đã biết (prototype pollution / ReDoS) và **không** được vá trên registry. Cân nhắc chuyển sang bản phân phối chính chủ hoặc thư viện khác, hoặc chỉ dùng ở luồng chỉ-ghi với dữ liệu nội bộ |
| `react-is@^19.2.7` | Lệch major so với `react@^18.3.1` — xác định vì sao có mặt, có phải phụ thuộc gián tiếp bị nâng nhầm không |
| `nodemailer@^9.0.3`, `otplib@^13.4.1` | Kiểm phiên bản có tồn tại thật và có CVE mở không |
| `express@^4.19.2` | Dùng dấu `^` — kiểm lockfile xem bản thực tế đã cài |

Ghi kết quả vào Bug Log: mỗi CVE mức High trở lên = một dòng riêng, không gộp thành một dòng "cập nhật dependency".

## 2. SAST — quét mã tĩnh (chạy D3–D6, song song với rà soát thủ công)

**Semgrep** (khuyến nghị — nhẹ, có sẵn bộ luật OWASP):

```bash
# Bộ luật cộng đồng cho JS/TS + Express
npx --yes semgrep --config=p/javascript --config=p/nodejs --config=p/owasp-top-ten \
  --exclude=node_modules --exclude=dist --json > sast-semgrep.json

# Chỉ lấy phát hiện mức ERROR để xem trước
npx --yes semgrep --config=p/owasp-top-ten --severity=ERROR src server/src
```

Bộ luật đáng chạy riêng cho dự án này:
- `p/sql-injection` — trọng tâm là chỗ nối chuỗi trong `ORDER BY`
- `p/jwt` — kiểm việc chốt thuật toán khi verify
- `p/secrets` — quét khoá bị hard-code

**Grep thủ công cho các mẫu nguy hiểm** (nhanh, chạy trước khi cài công cụ):

```bash
# SQL nối chuỗi
grep -rn 'query(`' server/src | grep '\${'

# Nuốt lỗi im lặng
grep -rn "catch\s*{\s*}\|catch\s*(\w*)\s*{\s*}" server/src src

# Route admin thiếu authorize
grep -rn "router\.\(get\|post\|patch\|put\|delete\)" server/src/routes/admin | grep -v authorize

# Bí mật hard-code
grep -rniE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_/+-]{16,}" src server/src

# Render HTML thô ở frontend
grep -rn "dangerouslySetInnerHTML\|rehype-raw" src
```

## 3. Quét secrets trong lịch sử git (chạy D6)

```bash
# Tìm dấu vết khoá từng bị commit
for k in JWT_SECRET ENCRYPTION_KEY HASH_PEPPER GEMINI_API_KEY BREVO_API_KEY TURNSTILE_SECRET_KEY; do
  echo "=== $k ==="
  git log --all --oneline -S"$k" | head -20
done

# Kiểm file cấu hình đang nằm trong repo
git log --oneline -- .env.production server/.env .env
```

**Nguyên tắc xử lý:** khoá đã từng lộ trong lịch sử git thì **phải xoay khoá**, không chỉ
xoá commit. Xoá lịch sử không thu hồi được bản sao mà người khác đã clone.

> **Đã kiểm sơ bộ ngày 10/09:** `.env.production` có mặt trong thư mục dự án nhưng chỉ chứa
> bốn giá trị `VITE_*` **công khai theo thiết kế** (API URL, Turnstile *site* key, Cloudinary
> cloud name + unsigned preset), và `.gitignore` đã có `.env.*` nên nhiều khả năng file không
> bị theo dõi. **Vẫn phải xác nhận ở D6:** chạy `git ls-files --error-unmatch .env.production`
> để biết chắc nó có bị commit không, và soát lịch sử xem có bản cũ nào từng chứa khoá bí mật.

## 4. DAST — quét động (chạy D5–D6, **chỉ trên staging**)

**OWASP ZAP** ở chế độ baseline (thụ động, không tấn công):

```bash
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t https://<địa-chỉ-staging> -r zap-baseline.html
```

Quét chủ động (`zap-full-scan.py`) **chỉ chạy khi**: (a) đúng là staging của mình, (b) đã sao
lưu dữ liệu, (c) đã báo trước cho nhà cung cấp hosting nếu họ yêu cầu. Không bao giờ chạy vào production.

**Kiểm header nhanh bằng curl** (làm được ngay, không cần công cụ):

```bash
# Header của API
curl -sI https://<backend>/api/health | grep -iE "strict-transport|content-security|x-frame|referrer|permissions"

# Header của frontend — phải KHỚP giữa bản Netlify (public/_headers) và bản Vercel (vercel.json)
curl -sI https://<frontend>/ | grep -iE "strict-transport|content-security|x-frame|referrer|permissions"

# Kiểm CORS có bị nới lỏng không
curl -sI -H "Origin: https://ke-tan-cong.example" https://<backend>/api/health | grep -i access-control
```

## 5. Kiểm tra build & test của chính dự án (chạy mọi ngày)

```bash
# Backend: 285 test, không cần MySQL
cd server && npm test

# Frontend: kiểm kiểu TypeScript + build production
npm run build
```

Hai lệnh này là **cổng chặn** ở mọi commit của Giai đoạn 3 và là điều kiện đóng Giai đoạn 4.

## 6. Bảng đối chiếu kết quả (điền ở D6)

| Nguồn phát hiện | Số phát hiện | Số trùng với rà soát thủ công | Số **chỉ nguồn này** tìm ra |
|---|---|---|---|
| Rà soát thủ công (người/AI) | | — | |
| Semgrep | | | |
| `npm audit` | | | |
| ZAP baseline | | | |
| Kiểm header bằng curl | | | |

Cột cuối cùng là cột quan trọng nhất của cả bảng. Nếu Semgrep tìm ra 5 thứ mà đợt rà soát
thủ công bỏ sót hết, đó là thông tin phải đưa vào báo cáo — nó nói lên chất lượng của quy
trình, không chỉ chất lượng của code.
