/**
 * CAPTCHA chống bot — Cloudflare Turnstile (miễn phí).
 *
 * VÌ SAO: web public rộng rãi -> bot sẽ spam hàng nghìn ý kiến rác,
 * làm phồng database và tốn tiền hosting.
 *
 * Turnstile không bắt người dân chọn ảnh phiền phức như reCAPTCHA cũ.
 *
 * Lấy khoá: dash.cloudflare.com -> Turnstile -> Add site
 *   - Site Key   -> đặt vào FRONTEND: VITE_TURNSTILE_SITE_KEY
 *   - Secret Key -> đặt vào BACKEND:  TURNSTILE_SECRET_KEY
 *
 * BẮT BUỘC Ở MÁY CHẠY THẬT (BUG-002, quyết định D5). Turnstile không còn là
 * tính năng tuỳ chọn: nó là lớp THAY THẾ cho việc khoá tài khoản cán bộ khi sai
 * mật khẩu (routes/auth.js — cố ý không khoá, xem test G5). Lớp đó tự tắt khi
 * thiếu khoá thì máy dò mật khẩu xoay IP là dò không giới hạn, mà nhìn từ ngoài
 * vẫn tưởng "có CAPTCHA". Vì vậy:
 *   · Thiếu khoá -> máy chủ KHÔNG KHỞI ĐỘNG (kiemKhoaTurnstileKhiKhoiDong), trừ
 *     máy khai rõ NODE_ENV=development (bỏ qua, kèm cảnh báo đỏ).
 *   · Có khoá mà Cloudflare không xác nhận được -> TỪ CHỐI, không cho qua.
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled() {
  return Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim());
}

/* Allow-list ĐÚNG MỘT giá trị, so khớp chính xác: chỉ máy khai rõ "development"
   mới được chạy không khoá. Không đặt (Render không tự đặt NODE_ENV),
   "production", "Production", "test", "Development"... đều tính là máy thật.
   "test" cũng không được: máy chạy thật lỡ khai NODE_ENV=test thì thà không
   khởi động còn hơn mở cửa cho máy dò (bộ test nạp router trực tiếp, không đi
   qua start(), nên không cần ngoại lệ này). */
function choPhepThieuKhoa(env = process.env) {
  return String(env.NODE_ENV ?? '').trim() === 'development';
}

/**
 * KIỂM KHOÁ LÚC KHỞI ĐỘNG — BUG-002 (thay cảnh báo của BUG-026).
 * Gọi ĐẦU TIÊN trong start() của MỌI điểm khởi động, trước khi nghe cổng.
 *   · Có khoá                       -> null
 *   · Thiếu khoá, NODE_ENV=development -> chuỗi cảnh báo đỏ (vẫn chạy, bỏ qua xác minh)
 *   · Thiếu khoá, còn lại           -> NÉM LỖI: máy chủ không khởi động
 * Rỗng và toàn khoảng trắng đều tính là thiếu.
 */
export function kiemKhoaTurnstileKhiKhoiDong(env = process.env) {
  if (String(env.TURNSTILE_SECRET_KEY ?? '').trim()) return null;
  if (choPhepThieuKhoa(env)) {
    return '🔴 CHỐNG MÁY TỰ ĐỘNG ĐANG TẮT (NODE_ENV=development): chưa khai TURNSTILE_SECRET_KEY nên '
      + 'cổng "không phải người máy" và ô xác minh sau 3 lần đăng nhập sai đều BỎ QUA. '
      + 'Chỉ dùng ở máy cá nhân — máy chạy thật thiếu khoá sẽ không khởi động.';
  }
  throw new Error(
    'THIẾU TURNSTILE_SECRET_KEY.\n'
    + '   Máy chủ không khởi động vì thiếu khoá của lớp chống máy tự động: cổng gửi tin\n'
    + '   và lớp chống dò mật khẩu cán bộ (hệ thống cố ý không khoá tài khoản khi sai\n'
    + '   mật khẩu — lớp thay thế chính là xác minh Turnstile).\n'
    + '   → Khai TURNSTILE_SECRET_KEY (máy chủ) và VITE_TURNSTILE_SITE_KEY (giao diện):\n'
    + '     dash.cloudflare.com -> Turnstile -> Add site.\n'
    + `   → Chạy thử ở máy cá nhân không cần khoá: đặt NODE_ENV=development (hiện: "${env.NODE_ENV ?? ''}").`
  );
}

const LOI_CHUA_XAC_MINH = 'Vui lòng hoàn tất bước xác minh "Tôi không phải người máy".';
const LOI_KHONG_KIEM_DUOC = 'Chưa kiểm được bước xác minh "Tôi không phải người máy". Vui lòng thử lại sau ít phút.';

/** Trả về { ok: true } hoặc { ok: false, error: '...' } */
export async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) {
    /* Máy chạy thật thiếu khoá đã không khởi động được (kiemKhoaTurnstileKhiKhoiDong).
       Tới được đây mà không phải development nghĩa là có lối khởi động bỏ qua bước
       kiểm đó — CHẶN, không cho qua, và báo cho người vận hành (người dùng không tự
       sửa được lỗi cấu hình này). */
    if (choPhepThieuKhoa()) return { ok: true };
    console.error('🔴 Turnstile: thiếu TURNSTILE_SECRET_KEY ở máy không phải development — TỪ CHỐI xác minh.');
    return { ok: false, error: LOI_CHUA_XAC_MINH };
  }

  if (!token) return { ok: false, error: LOI_CHUA_XAC_MINH };

  try {
    const form = new URLSearchParams();
    form.append('secret', process.env.TURNSTILE_SECRET_KEY.trim());
    form.append('response', token);
    if (ip) form.append('remoteip', ip);

    const r = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    /* Chỉ đúng giá trị boolean true mới qua — allow-list. Chuỗi "false", số 1,
       trường thiếu... đều là "không xác nhận được". */
    if (data?.success === true) return { ok: true };
    return { ok: false, error: 'Xác minh chống bot thất bại. Vui lòng tải lại trang và thử lại.' };
  } catch (e) {
    /* Lỗi mạng, hết giờ, Cloudflare trả trang lỗi không phải JSON -> TỪ CHỐI (D5).
       Trước BUG-002 nhánh này cho qua "để không chặn người dân thật" — nhưng cùng
       hàm này giữ cửa đăng nhập cán bộ: cho qua ở đây là máy dò mật khẩu chỉ cần
       làm Cloudflare không trả lời được. Người dân không mất thêm gì đáng kể: ô
       xác minh trên trang cũng tải từ Cloudflare, Cloudflare sập thì vốn đã không
       lấy được mã; vé cổng vào đã cấp vẫn dùng được trong HAN_VE. */
    console.warn('Turnstile: không kiểm được với Cloudflare — TỪ CHỐI:', e.message);
    return { ok: false, error: LOI_KHONG_KIEM_DUOC };
  }
}

/**
 * XÁC MINH THÊM — KIỂM NGHIÊM NGẶT (P88, chặn mềm theo mạng).
 *
 * Từ BUG-002, verifyTurnstile cũng từ chối khi Cloudflare không trả lời được;
 * hàm này còn chặt hơn ở hai chỗ: chưa bật Turnstile thì từ chối kể cả ở máy
 * development (không có lối mở thêm nào — fail-safe), và mã chỉ nhận chuỗi
 * ≤ 2048 ký tự. Đây là lối "mở thêm" cho mạng đã vượt ngưỡng: không kiểm được
 * thì giữ nguyên giới hạn, người dân vẫn gọi 113 hoặc đợi hết giờ.
 *
 * Mã Turnstile chỉ dùng được một lần (Cloudflare tự từ chối lần thứ hai).
 */
export async function xacMinhNghiemNgat(token, ip) {
  if (!turnstileEnabled()) return { ok: false };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false };
  try {
    const form = new URLSearchParams();
    form.append('secret', process.env.TURNSTILE_SECRET_KEY.trim());
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const r = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    return { ok: data?.success === true };
  } catch (e) {
    console.warn('[xác minh thêm] Cloudflare không trả lời — giữ nguyên giới hạn:', e.message);
    return { ok: false };
  }
}
