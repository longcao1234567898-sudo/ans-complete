/**
 * Mã hoá danh tính người gửi (AES-256-GCM).
 *
 * VÌ SAO: sender_name / sender_phone là danh tính người TỐ GIÁC.
 * Nếu database bị lộ, kẻ xấu biết ai đã tố giác -> nguy hiểm tính mạng.
 * Mã hoá xong, dù lấy được database cũng chỉ thấy chuỗi vô nghĩa.
 *
 * Khoá nằm ở biến môi trường ENCRYPTION_KEY (64 ký tự hex).
 * Tạo khoá: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * TƯƠNG THÍCH NGƯỢC: dữ liệu cũ chưa mã hoá vẫn đọc được bình thường.
 */
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = (process.env.ENCRYPTION_KEY || '').trim();
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.warn('⚠️  ENCRYPTION_KEY không đúng định dạng (cần 64 ký tự hex) — TẠM THỜI KHÔNG MÃ HOÁ');
    return null;
  }
  return Buffer.from(hex, 'hex');
}

/** Mã hoá 1 chuỗi. Không có khoá -> trả nguyên văn (để hệ thống không chết). */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const key = getKey();
  if (!key) return String(plain);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

/** Giải mã. Nếu là dữ liệu cũ (chưa mã hoá) thì trả về nguyên văn. */
export function decrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  const s = String(value);
  if (!s.startsWith(PREFIX)) return s; // dữ liệu cũ, chưa mã hoá
  const key = getKey();
  if (!key) return '[Không giải mã được — thiếu ENCRYPTION_KEY]';
  try {
    const [ivHex, tagHex, dataHex] = s.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return '[Dữ liệu hỏng hoặc sai khoá]';
  }
}

/** Che số điện thoại: 0909123456 -> 090****456 */
export function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length < 7) return '***';
  return s.slice(0, 3) + '****' + s.slice(-3);
}

/** Che họ tên: Nguyễn Văn An -> Nguyễn V*** A** */
export function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return '***';
  return s.split(/\s+/)
    .map((w, i) => (i === 0 ? w : w[0] + '*'.repeat(Math.max(1, w.length - 1))))
    .join(' ');
}

/** Băm SĐT để dò spam mà không lộ số thật */
export function hashPhone(phone) {
  return crypto.createHash('sha256').update(String(phone || '')).digest('hex');
}

export function encryptionEnabled() {
  return getKey() !== null;
}
