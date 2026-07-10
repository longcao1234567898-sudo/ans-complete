/**
 * Quản lý JWT: access token (ngắn hạn) + refresh token (dài hạn, lưu DB, thu hồi được).
 */
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'doi-secret-nay-trong-file-env';
const ACCESS_TTL = '8h';        // access token sống 8 giờ
const REFRESH_TTL_DAYS = 30;    // refresh token sống 30 ngày

/** Sinh access token chứa thông tin cán bộ */
export function signAccessToken(staff) {
  return jwt.sign(
    { sub: staff.id, username: staff.username, role: staff.role, name: staff.full_name },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

/** Xác minh access token — ném lỗi nếu sai/hết hạn */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Sinh refresh token ngẫu nhiên (lưu hash vào DB) */
export function generateRefreshToken() {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  return { raw, hash, expiresAt };
}

/** Hash một refresh token thô để so với DB */
export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
