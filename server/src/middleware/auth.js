/** Middleware: yêu cầu đã đăng nhập. Gắn req.staff nếu token hợp lệ. */
import { verifyAccessToken } from '../lib/token.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });

  try {
    const payload = verifyAccessToken(token);
    req.staff = { id: payload.sub, username: payload.username, role: payload.role, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }
}
