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
 * Nếu CHƯA cấu hình khoá -> tự động bỏ qua (hệ thống vẫn chạy bình thường).
 */
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileEnabled() {
  return Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim());
}

/**
 * Cảnh báo lúc khởi động khi máy thật thiếu khoá — BUG-026.
 * Thiếu khoá thì cổng chống máy tự động cho mọi yêu cầu qua (đánh đổi ghi ở
 * cong-vao.js). Ở máy cá nhân đó là ý muốn; ở máy thật phải có người BIẾT.
 * Giống BUG-025: chỉ NODE_ENV khai rõ development/test mới được im lặng —
 * Render không đặt NODE_ENV, không khai nghĩa là máy thật.
 * Trả chuỗi cảnh báo, hoặc null khi không có gì phải báo.
 */
export function canhBaoTurnstile() {
  if (turnstileEnabled()) return null;
  if (['development', 'test'].includes((process.env.NODE_ENV || '').trim())) return null;
  return '🔴 CHỐNG MÁY TỰ ĐỘNG ĐANG TẮT: chưa khai TURNSTILE_SECRET_KEY nên cổng xác minh '
    + '"không phải người máy" cho MỌI yêu cầu qua. Khai TURNSTILE_SECRET_KEY (máy chủ) và '
    + 'VITE_TURNSTILE_SITE_KEY (giao diện) — dash.cloudflare.com -> Turnstile.';
}

/** Trả về { ok: true } hoặc { ok: false, error: '...' } */
export async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) return { ok: true }; // chưa bật -> cho qua

  if (!token) return { ok: false, error: 'Vui lòng hoàn tất bước xác minh "Tôi không phải người máy".' };

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
    if (data.success) return { ok: true };
    return { ok: false, error: 'Xác minh chống bot thất bại. Vui lòng tải lại trang và thử lại.' };
  } catch (e) {
    console.warn('Turnstile lỗi mạng, tạm cho qua:', e.message);
    return { ok: true }; // lỗi mạng phía Cloudflare -> không chặn người dân thật
  }
}
