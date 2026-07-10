/** Xác thực cán bộ: đăng nhập, làm mới token, đăng xuất, xem thông tin bản thân */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  signAccessToken, generateRefreshToken, hashRefreshToken,
} from '../lib/token.js';

const router = Router();

// Chống dò mật khẩu: tối đa 5 lần đăng nhập / 15 phút / IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 15 phút.' },
});

const COOKIE_OPTS = {
  httpOnly: true,           // JavaScript không đọc được -> chống XSS đánh cắp token
  secure: process.env.NODE_ENV === 'production', // chỉ gửi qua HTTPS khi production
  sameSite: 'lax',
  maxAge: 30 * 86400_000,   // 30 ngày
  path: '/api/auth',
};

/** POST /api/auth/login */
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });

  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, username, password_hash, role, is_active FROM staff WHERE username = ?',
      [String(username).trim()]
    );
    const staff = rows[0];
    // Luôn so sánh bcrypt kể cả khi không tìm thấy user -> chống dò tài khoản qua thời gian phản hồi
    const dummyHash = '$2a$12$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(password, staff?.password_hash || dummyHash);

    if (!staff || !ok) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    if (!staff.is_active) return res.status(403).json({ error: 'Tài khoản đã bị khoá.' });

    // Cấp access token + refresh token
    const accessToken = signAccessToken(staff);
    const { raw, hash, expiresAt } = generateRefreshToken();
    await pool.query(
      'INSERT INTO refresh_tokens (staff_id, token_hash, expires_at) VALUES (?,?,?)',
      [staff.id, hash, expiresAt]
    );
    await pool.query('UPDATE staff SET last_login = NOW() WHERE id = ?', [staff.id]);
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, ip_address) VALUES (?,?,?)',
      [staff.id, 'login', (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim()]
    );

    res.cookie('refreshToken', raw, COOKIE_OPTS);
    res.json({
      accessToken,
      staff: { id: staff.id, name: staff.full_name, username: staff.username, role: staff.role },
    });
  } catch (err) {
    console.error('Lỗi đăng nhập:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi đăng nhập.' });
  }
});

/** POST /api/auth/refresh — dùng refresh token trong cookie lấy access token mới */
router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (!raw) return res.status(401).json({ error: 'Không có phiên đăng nhập.' });

  try {
    const hash = hashRefreshToken(raw);
    const [rows] = await pool.query(
      `SELECT rt.id, rt.expires_at, s.id AS staff_id, s.full_name, s.username, s.role, s.is_active
       FROM refresh_tokens rt JOIN staff s ON s.id = rt.staff_id
       WHERE rt.token_hash = ? AND rt.revoked = FALSE`,
      [hash]
    );
    const row = rows[0];
    if (!row || new Date(row.expires_at) < new Date() || !row.is_active) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
    }
    const accessToken = signAccessToken({
      id: row.staff_id, full_name: row.full_name, username: row.username, role: row.role,
    });
    res.json({
      accessToken,
      staff: { id: row.staff_id, name: row.full_name, username: row.username, role: row.role },
    });
  } catch (err) {
    console.error('Lỗi refresh:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** POST /api/auth/logout — thu hồi refresh token */
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (raw) {
    try {
      await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?', [hashRefreshToken(raw)]);
    } catch { /* bỏ qua */ }
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ ok: true });
});

/** GET /api/auth/me — thông tin cán bộ đang đăng nhập */
router.get('/me', requireAuth, (req, res) => res.json({ staff: req.staff }));

export default router;
