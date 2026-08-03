/**
 * Mã hoá danh tính người gửi (AES-256-GCM).
 *
 * VÌ SAO: sender_name / sender_phone là danh tính người TỐ GIÁC.
 * Nếu database bị lộ, kẻ xấu biết ai đã tố giác -> nguy hiểm tính mạng.
 * Mã hoá xong, dù lấy được database cũng chỉ thấy chuỗi vô nghĩa.
 *
 * Khoá nằm ở biến môi trường ENCRYPTION_KEY (64 ký tự hex).
 * Tạo khoá: node scripts-tao-khoa-ma-hoa.js
 *
 * TƯƠNG THÍCH NGƯỢC: dữ liệu cũ chưa mã hoá vẫn đọc được bình thường.
 *
 * NGUYÊN TẮC AN TOÀN KHI HỎNG (fail-safe):
 *   Thiếu khoá -> encrypt() NÉM LỖI, route trả 503, KHÔNG lưu gì.
 *   Tuyệt đối không lưu danh tính dạng chữ trần như một "phương án dự phòng".
 *   Ý kiến ẩn danh vẫn gửi được vì không có danh tính để mã hoá.
 */
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

/**
 * Lỗi ném ra khi được yêu cầu mã hoá nhưng khoá không dùng được.
 * Có mã riêng để tầng route bắt đúng loại lỗi này và trả 503 thay vì 500.
 */
export class EncryptionUnavailableError extends Error {
  constructor(reason) {
    super('Chức năng mã hoá danh tính chưa sẵn sàng: ' + reason);
    this.name = 'EncryptionUnavailableError';
    this.code = 'ENCRYPTION_UNAVAILABLE';
    this.reason = reason;
  }
}

/* Đọc khoá 1 lần rồi nhớ luôn: trước đây getKey() chạy lại ở MỖI lần mã hoá,
   nên khoá sai là log bị spam hàng nghìn dòng cảnh báo giống nhau. */
let cachedKey;           // undefined = chưa đọc lần nào
let keyProblem = null;   // null = không có vấn đề gì

function getKey() {
  if (cachedKey !== undefined) return cachedKey;

  const hex = (process.env.ENCRYPTION_KEY || '').trim();

  if (!hex) {
    keyProblem = 'chưa đặt biến môi trường ENCRYPTION_KEY';
  } else if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    keyProblem = `ENCRYPTION_KEY sai định dạng (cần đúng 64 ký tự hex 0-9a-f, đang có ${hex.length} ký tự)`;
  } else if (/^0+$/.test(hex)) {
    // Khoá toàn số 0 thường là do copy thiếu hoặc điền tạm — coi như không có khoá
    keyProblem = 'ENCRYPTION_KEY toàn số 0, không phải khoá thật';
  }

  if (keyProblem) {
    console.error('🔴 ' + keyProblem);
    console.error('   → Hệ thống sẽ TỪ CHỐI nhận ý kiến có danh tính cho tới khi khắc phục.');
    console.error('   → Tạo khoá mới: node scripts-tao-khoa-ma-hoa.js');
    cachedKey = null;
    return null;
  }

  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

/** Lý do khoá không dùng được (để hiện ở /api/health) — null nghĩa là bình thường. */
export function encryptionProblem() {
  getKey();
  return keyProblem;
}

/**
 * Chặn sớm: gọi ở đầu route TRƯỚC khi làm gì khác.
 * Ném lỗi nếu chưa mã hoá được, để route trả 503 và KHÔNG lưu gì vào database.
 */
export function assertEncryptionReady() {
  if (!getKey()) throw new EncryptionUnavailableError(keyProblem);
}

/**
 * Mã hoá 1 chuỗi.
 *
 * ⚠️ KHÔNG CÓ KHOÁ THÌ NÉM LỖI, KHÔNG trả nguyên văn.
 *
 * Bản cũ trả về nguyên văn "để hệ thống không chết". Nghe thì hợp lý nhưng
 * hậu quả tệ hơn nhiều: web vẫn chạy, không báo lỗi gì, mà tên và số điện
 * thoại người TỐ GIÁC bị ghi thẳng dạng chữ vào database — không ai biết
 * cho tới khi mở bảng ra xem. Hỏng âm thầm nguy hiểm hơn hỏng ồn ào.
 *
 * Nguyên tắc mới: thà TỪ CHỐI NHẬN còn hơn nhận rồi để lộ danh tính.
 * Ý kiến ẩn danh không có gì để mã hoá nên vẫn gửi được bình thường —
 * kênh tố giác quan trọng nhất không bị gián đoạn.
 */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const key = getKey();
  if (!key) throw new EncryptionUnavailableError(keyProblem);
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

/* ===== BĂM ĐỊNH DANH — CÓ PEPPER =====
   Pepper nằm ở biến môi trường, KHÔNG nằm trong database -> lộ database vẫn
   không dò ngược được.

   Đây là điểm khác biệt then chốt so với SHA-256 trần dùng trước đây: miền giá
   trị SĐT di động Việt Nam chỉ khoảng 10^8, dựng bảng tra ngược toàn bộ mất vài
   phút trên laptop. Nghĩa là cột sender_phone_hash đã PHÁ VỠ HOÀN TOÀN lớp
   AES-256-GCM của cột sender_phone nằm ngay bên cạnh. */
let cachedPepper;
function getPepper() {
  if (cachedPepper !== undefined) return cachedPepper;
  const p = (process.env.HASH_PEPPER || '').trim();
  if (p.length < 32) {
    throw new Error(
      'HASH_PEPPER chưa đặt hoặc quá ngắn (cần tối thiểu 32 ký tự). ' +
      'Tạo: openssl rand -hex 32'
    );
  }
  cachedPepper = p;
  return cachedPepper;
}

/** Băm một định danh (SĐT, email, IP) theo cách KHÔNG dò ngược được. */
export function hashIdentifier(value) {
  return crypto.createHmac('sha256', getPepper())
               .update(String(value ?? ''))
               .digest('hex');
}

/** Băm SĐT để dò spam mà không lộ số thật */
export function hashPhone(phone) {
  return hashIdentifier(phone);
}

export function encryptionEnabled() {
  return getKey() !== null;
}
