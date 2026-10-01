/**
 * CỔNG VÀO — XÁC MINH "KHÔNG PHẢI NGƯỜI MÁY" MỘT LẦN KHI VÀO WEB (ADR-003 việc 23)
 * ============================================================================
 *
 * Trước: mỗi form (gửi ý kiến, đăng nhập) tự bày ô Turnstile. Nay: một bước xác
 * minh khi vào web; xác minh xong máy chủ cấp VÉ ký bằng JWT_SECRET, sống
 * HAN_VE. Mọi lần gửi tin, đăng nhập phải trình vé — kiểm ở máy chủ, vì máy tự
 * động gọi thẳng API chứ không mở trang.
 *
 * ĐÁNH ĐỔI ĐÃ CHẤP NHẬN:
 *   · Vé không gắn với địa chỉ mạng: bà con dùng 4G đổi IP liên tục, gắn vào
 *     là đang điền đơn thì vé hỏng. Một bot lấy được vé dùng lại trong HAN_VE
 *     vẫn vướng giới hạn theo mạng, số điện thoại, nội dung ở route gửi tin.
 *   · Chưa khai TURNSTILE_SECRET_KEY: không bắt vé — giữ đúng hành vi cũ của
 *     lib/turnstile.js (không có khoá thì bỏ qua xác minh).
 *   · Khoảng chuyển đổi: trình duyệt còn giữ giao diện cũ gửi captchaToken của
 *     từng form — vẫn nhận nếu Cloudflare xác nhận token đó.
 */
import jwt from 'jsonwebtoken';
import { verifyTurnstile, turnstileEnabled } from './turnstile.js';

export const HAN_VE = '6h';
const MUC_DICH = 'cong_vao';

export const LOI_CAN_XAC_MINH = 'Phiên xác minh "không phải người máy" đã hết hạn. Bà con tải lại trang để xác minh lại. '
  + 'Việc khẩn cấp xin gọi ngay 113.';

export function capVe() {
  return jwt.sign({ purpose: MUC_DICH }, process.env.JWT_SECRET, { expiresIn: HAN_VE });
}

/** Vé hợp lệ: đúng chữ ký, còn hạn, đúng mục đích. Chỉ nhận chuỗi. */
export function veHopLe(ve) {
  if (typeof ve !== 'string' || !ve) return false;
  try {
    return jwt.verify(ve, process.env.JWT_SECRET).purpose === MUC_DICH;
  } catch {
    return false;
  }
}

/**
 * Kiểm cổng cho một lần gửi tin / đăng nhập.
 * @returns {Promise<{ ok: true } | { ok: false, code: 'CAN_XAC_MINH', error: string }>}
 */
export async function quaCongVao(body, ip) {
  if (!turnstileEnabled()) return { ok: true };
  if (veHopLe(body?.veVaoCua)) return { ok: true };
  /* Giao diện cũ (khoảng chuyển đổi): token Turnstile của form */
  if (typeof body?.captchaToken === 'string' && body.captchaToken) {
    const kq = await verifyTurnstile(body.captchaToken, ip);
    if (kq.ok) return { ok: true };
  }
  return { ok: false, code: 'CAN_XAC_MINH', error: LOI_CAN_XAC_MINH };
}
