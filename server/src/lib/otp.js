/**
 * Xác thực OTP qua email cho công dân.
 * Mã lưu dạng BĂM (SHA-256) — lộ database cũng không đọc được mã.
 */
import crypto from 'node:crypto';

export const OTP_TTL_MS = 5 * 60_000;      // hiệu lực 5 phút
export const OTP_MAX_ATTEMPTS = 5;         // sai quá 5 lần -> huỷ mã
export const OTP_RESEND_MS = 60_000;       // 60 giây mới được xin mã mới
export const OTP_MAX_PER_HOUR = 5;         // tối đa 5 mã/giờ/email

/** Sinh mã 6 số (000000-999999) */
export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}
