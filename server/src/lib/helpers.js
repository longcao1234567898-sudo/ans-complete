import crypto from 'node:crypto';

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Sinh mã tra cứu 6 ký tự (bỏ 0/O, 1/I/L) */
export function generateTrackingCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) code += CHARSET[crypto.randomInt(CHARSET.length)];
  return code;
}

/** SHA-256 của nội dung — phục vụ chặn gửi trùng (chống spam) */
export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Nhãn trạng thái tiếng Việt (khớp frontend) */
export const STATUS_LABEL = {
  received: 'Đã tiếp nhận',
  processing: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  rejected: 'Từ chối',
};
