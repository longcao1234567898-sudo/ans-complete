#!/usr/bin/env bash
# ============================================================================
#  DỰNG GIAO DIỆN VÀ ĐƯA LÊN NGINX (máy Viettel) — thay việc Netlify/Vercel tự dựng
# ============================================================================
#
#  Chạy bằng root, SAU khi đã git pull (Phần F của docs/HUONG-DAN-TRIEN-KHAI.md):
#      bash /opt/hop-thu/deploy/dung-giao-dien.sh
#
#  Làm gì, theo thứ tự — bước nào hỏng thì DỪNG, trang đang chạy không bị đụng tới:
#    1. Đọc /etc/hop-thu/giao-dien.env (chỉ các dòng VITE_*), kiểm địa chỉ máy chủ.
#    2. Dựng dist/ với đúng các biến đó (Vite ưu tiên biến môi trường hơn .env.production).
#    3. Kiểm gói JS thật sự chứa địa chỉ máy chủ.
#    4. Chép bản dựng sang /var/www/hop-thu/ban-NGAYGIO.
#    5. Viết tệp header (CSP chứa đúng địa chỉ máy chủ ở bước 1), đổi liên kết
#       hien-tai sang bản mới, chạy nginx -t. Hỏng -> trả lại header + bản cũ.
#    6. Nạp lại Nginx, giữ 5 bản gần nhất để quay lại khi cần.
#
#  Vì sao CSP lấy từ cùng biến với gói JS: trên Netlify địa chỉ máy chủ phải sửa
#  tay ở ba nơi (A6-2), lệch một ký tự là trình duyệt chặn sạch mọi lời gọi API
#  mà trang vẫn hiện bình thường. Ở đây chỉ có một nguồn.
# ============================================================================
set -euo pipefail
umask 022    # tệp dựng ra phải đọc được bởi Nginx (www-data)

MA_NGUON=/opt/hop-thu
TEP_BIEN=/etc/hop-thu/giao-dien.env
NOI_DAT=/var/www/hop-thu
MAU_HEADER="$MA_NGUON/deploy/nginx/hop-thu-header.conf"
HEADER_NGINX=/etc/nginx/snippets/hop-thu-header.conf
GIU_LAI=5

dung() { echo "❌ $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || dung "Chạy bằng root: sudo bash $0"
[ -f "$TEP_BIEN" ] || dung "Thiếu $TEP_BIEN — tạo theo mục F3."
[ -f "$MAU_HEADER" ] || dung "Thiếu $MAU_HEADER — mã nguồn chưa có thư mục deploy/ (git pull chưa?)"

# --- 1. Đọc biến -----------------------------------------------------------------
# Đọc như DỮ LIỆU, không "source": tệp cấu hình không được là nơi chạy lệnh.
# Chỉ nhận VITE_*: mọi biến VITE_* bị nhúng vào JS công khai, nên tệp này không
# bao giờ được chứa khoá bí mật — bỏ qua mọi dòng khác cho chắc.
while IFS= read -r dong || [ -n "$dong" ]; do
  dong="${dong%$'\r'}"                              # tệp soạn trên Windows
  [[ "$dong" =~ ^(VITE_[A-Z0-9_]+)=(.*)$ ]] || continue
  ten="${BASH_REMATCH[1]}"; gia="${BASH_REMATCH[2]}"
  # Bỏ một cặp nháy bao quanh nếu có: VITE_API_URL="https://..." vẫn nhận
  if [[ "$gia" =~ ^\"(.*)\"$ || "$gia" =~ ^\'(.*)\'$ ]]; then gia="${BASH_REMATCH[1]}"; fi
  # Dòng để trống KHÔNG ghi đè: "VITE_TURNSTILE_SITE_KEY=" mà xuất chuỗi rỗng thì bản
  # dựng mất khoá Turnstile trong .env.production — tắt chống máy tự động không báo gì
  [ -n "$gia" ] || continue
  export "$ten=$gia"
done < "$TEP_BIEN"

# Địa chỉ máy chủ đi thẳng vào tệp cấu hình Nginx chạy bằng root -> allow-list:
# đúng dạng https://ten-mien (chữ thường, có thể kèm cổng), không đường dẫn, không
# dấu ; " ' $ hay khoảng trắng. Sai dạng thì DỪNG, không cố "làm sạch".
la_goc_https() {
  [[ "$1" =~ ^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$ ]]
}
VITE_API_URL="${VITE_API_URL:-}"
la_goc_https "$VITE_API_URL" \
  || dung "VITE_API_URL phải có dạng https://api.ten-mien.vn (chữ thường, không có / ở cuối). Đang là: '$VITE_API_URL'"
MAY_CHU="$VITE_API_URL"
if [ -n "${VITE_ADMIN_API_URL:-}" ]; then
  la_goc_https "$VITE_ADMIN_API_URL" \
    || dung "VITE_ADMIN_API_URL phải có dạng https://canbo-api.ten-mien.vn. Đang là: '$VITE_ADMIN_API_URL'"
  [ "$VITE_ADMIN_API_URL" = "$VITE_API_URL" ] || MAY_CHU="$VITE_API_URL $VITE_ADMIN_API_URL"
fi

# --- 2. Dựng ------------------------------------------------------------------------
cd "$MA_NGUON"
echo "▶ Dựng giao diện từ commit $(git rev-parse --short HEAD) — máy chủ: $MAY_CHU"
npm ci --no-audit --no-fund
rm -rf dist
npm run build

# --- 3. Kiểm gói JS -----------------------------------------------------------------
# Biến không vào được bản dựng (gõ sai tên, quên export) thì Vite lặng lẽ lấy
# giá trị trong .env.production — trang chạy nhưng gọi nhầm máy chủ cũ.
[ -f dist/index.html ] || dung "Dựng xong mà không có dist/index.html"
grep -rqF "$VITE_API_URL" dist/assets || dung "Gói JS không chứa $VITE_API_URL — biến không vào được bản dựng"

# --- 4. Chép bản dựng ---------------------------------------------------------------
mkdir -p "$NOI_DAT" /etc/nginx/snippets
BAN="$NOI_DAT/ban-$(date +%Y%m%d-%H%M%S)"
cp -a dist "$BAN"
chmod -R a+rX "$BAN"

# --- 5. Đổi header + bản, kiểm trước khi nạp ---------------------------------------
# MAY_CHU đã qua la_goc_https: chỉ có chữ, số, . - : / và dấu cách -> an toàn cho sed
sed "s#__MAY_CHU__#$MAY_CHU#g" "$MAU_HEADER" > "$HEADER_NGINX.moi"
grep -q '__MAY_CHU__' "$HEADER_NGINX.moi" && dung "Còn sót __MAY_CHU__ trong tệp header"

HEADER_CU=""
if [ -f "$HEADER_NGINX" ]; then HEADER_CU="$HEADER_NGINX.truoc"; cp -a "$HEADER_NGINX" "$HEADER_CU"; fi
BAN_CU="$(readlink "$NOI_DAT/hien-tai" 2>/dev/null || true)"

tra_lai() {
  echo "↩ Trả lại cấu hình và bản cũ" >&2
  if [ -n "$HEADER_CU" ]; then mv -f "$HEADER_CU" "$HEADER_NGINX"; else rm -f "$HEADER_NGINX"; fi
  if [ -n "$BAN_CU" ]; then ln -sfn "$BAN_CU" "$NOI_DAT/hien-tai.moi" && mv -Tf "$NOI_DAT/hien-tai.moi" "$NOI_DAT/hien-tai"; fi
  # Xoá bản hỏng: để lại thì nó là thư mục MỚI NHẤT, người quay lại bằng tay dễ chọn nhầm
  rm -rf -- "$BAN"
}

mv -f "$HEADER_NGINX.moi" "$HEADER_NGINX"
# Đổi liên kết một nhát (mv -T thay nguyên tử): không có lúc nào trang trỏ vào chỗ trống
ln -sfn "$BAN" "$NOI_DAT/hien-tai.moi"
mv -Tf "$NOI_DAT/hien-tai.moi" "$NOI_DAT/hien-tai"

if ! nginx -t; then
  tra_lai
  dung "nginx -t báo lỗi — đã trả lại bản cũ, trang đang chạy không bị ảnh hưởng"
fi

# --- 6. Nạp lại và dọn ------------------------------------------------------------
systemctl reload nginx
rm -f "$HEADER_NGINX.truoc"
# Giữ GIU_LAI bản mới nhất (bản đang chạy là bản mới nhất)
ls -1dt "$NOI_DAT"/ban-* 2>/dev/null | tail -n +$((GIU_LAI + 1)) | xargs -r rm -rf --

echo "✅ Đã đưa lên: $BAN"
echo "   Kiểm: curl -sI https://www.TEN-MIEN | grep -i content-security-policy"
