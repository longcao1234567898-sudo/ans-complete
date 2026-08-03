import crypto from 'node:crypto';

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Sinh mã tra cứu 6 ký tự (bỏ 0/O, 1/I/L) */
export function generateTrackingCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) code += CHARSET[crypto.randomInt(CHARSET.length)];
  return code;
}

/**
 * IP thật của client.
 *
 * KHÔNG đọc header X-Forwarded-For thủ công: phần tử ĐẦU TIÊN của header đó do
 * CHÍNH CLIENT đặt (proxy chỉ nối thêm vào cuối), nên giả mạo được bằng một dòng
 * curl -H. Trước đây 8 chỗ trong mã nguồn đọc kiểu đó -> mọi hạn mức chống spam
 * theo IP đều vượt được, và tệ nhất là hệ thống cảnh báo dò mật khẩu
 * (routes/admin/logs.js) bị làm mù: đổi header mỗi request thì mỗi "IP" chỉ có
 * đúng 1 lần thất bại, không bao giờ chạm ngưỡng 5 lần để báo động.
 *
 * Express với trust proxy = 1 (src/index.js) đã bóc đúng hop tin cậy vào req.ip.
 */
export function clientIp(req) {
  return String(req.ip || '').replace(/^::ffff:/, '').slice(0, 45);
}

/** SHA-256 của nội dung — phục vụ chặn gửi trùng (chống spam) */
export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Nhãn trạng thái tiếng Việt (khớp frontend) */
export const STATUS_LABEL = {
  pending_review: 'Chờ kiểm duyệt',
  spam: 'Không tiếp nhận (tin rác)',
  received: 'Đã tiếp nhận',
  processing: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  rejected: 'Từ chối',
};
