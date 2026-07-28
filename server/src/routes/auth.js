/** Xác thực cán bộ: đăng nhập, làm mới token, đăng xuất, xem thông tin bản thân */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { verifyTurnstile } from '../lib/turnstile.js';
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

/* LỖI ĐÃ SỬA: trước đây dùng `secure: process.env.NODE_ENV === 'production'`.
   Nhưng Render KHÔNG tự đặt biến NODE_ENV, nên nó luôn undefined -> cờ secure
   luôn FALSE ngay cả khi chạy thật. Hậu quả: vé đăng nhập của cán bộ có thể
   bị gửi qua kết nối HTTP không mã hoá.

   Cách sửa: mặc định BẬT secure, chỉ tắt khi chạy ở máy cá nhân (localhost).
   Nguyên tắc: an toàn là mặc định, nới lỏng phải khai báo tường minh. */
const CHAY_O_MAY_CA_NHAN =
  (process.env.CLIENT_URL || '').includes('localhost') ||
  (process.env.CLIENT_URL || '').includes('127.0.0.1');

const COOKIE_OPTS = {
  httpOnly: true,                    // JavaScript không đọc được -> chống XSS đánh cắp vé
  secure: !CHAY_O_MAY_CA_NHAN,       // BẬT mặc định, chỉ tắt khi chạy localhost
  sameSite: 'lax',
  maxAge: 30 * 86400_000,            // 30 ngày
  path: '/api/auth',
};

/* CHỐNG DÒ MẬT KHẨU — KHÔNG KHOÁ TÀI KHOẢN

   VÌ SAO KHÔNG KHOÁ:
   Khoá tài khoản nghe có vẻ an toàn nhưng lại tạo ra lỗ hổng khác nguy hiểm
   hơn: kẻ xấu chỉ cần cố ý gõ sai liên tục là KHOÁ ĐƯỢC cán bộ thật ra khỏi
   hệ thống. Cứ hết hạn khoá lại gõ sai tiếp — cán bộ vĩnh viễn không vào được.
   Với hệ thống tiếp nhận tin báo khẩn cấp, hậu quả đó nặng hơn cả việc bị dò
   mật khẩu.

   CÁCH LÀM THAY THẾ — BẮT XÁC MINH CAPTCHA:
   Sai từ 3 lần trở lên thì yêu cầu qua ô "Tôi không phải người máy".
     - Máy tự động dò mật khẩu -> KHÔNG vượt được captcha -> bị chặn
     - Cán bộ thật -> tích một cái là vào được ngay, KHÔNG bị khoá
   Bảo vệ đúng thứ cần bảo vệ mà không tạo cửa phá hoại mới. */
const SO_LAN_SAI_BAT_CAPTCHA = 3;

/** Ghi vết mọi lần đăng nhập thất bại — để phát hiện tấn công đang diễn ra */
async function ghiThatBai(staffId, username, ip) {
  try {
    await pool.query(
      `INSERT INTO staff_activity_logs (staff_id, action, ip_address, attempted_username)
       VALUES (?, 'login_failed', ?, ?)`,
      [staffId, ip, String(username || '').slice(0, 50)]
    );
  } catch {
    /* Bảng chưa nâng cấp v9 -> bỏ qua, KHÔNG làm hỏng luồng đăng nhập.
       Ghi nhật ký hỏng không được cản người dùng hợp lệ vào hệ thống. */
  }
}

/** POST /api/auth/login */
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });

  try {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();

    /* Lấy thêm failed_attempts và locked_until. Dùng COALESCE để vẫn chạy
       được khi database chưa nâng cấp v9 — không làm sập đăng nhập. */
    let staff;
    try {
      const [rows] = await pool.query(
        `SELECT id, full_name, username, password_hash, role, is_active,
                COALESCE(failed_attempts, 0) AS failed_attempts, locked_until
         FROM staff WHERE username = ?`,
        [String(username).trim()]
      );
      staff = rows[0];
    } catch {
      // Chưa chạy v9 -> dùng truy vấn cũ
      const [rows] = await pool.query(
        'SELECT id, full_name, username, password_hash, role, is_active FROM staff WHERE username = ?',
        [String(username).trim()]
      );
      staff = rows[0];
    }

    /* ĐÃ SAI NHIỀU LẦN -> BẮT QUA CAPTCHA (không khoá tài khoản) */
    const soLanSaiHienTai = Number(staff?.failed_attempts || 0);
    if (soLanSaiHienTai >= SO_LAN_SAI_BAT_CAPTCHA) {
      const kq = await verifyTurnstile(req.body?.captchaToken, ip);
      if (!kq.ok) {
        await ghiThatBai(staff?.id ?? null, username, ip);
        return res.status(401).json({
          error: 'Vui lòng tích vào ô xác minh "Tôi không phải là người máy" rồi đăng nhập lại.',
          canCaptcha: true,   // báo giao diện hiện ô captcha
        });
      }
    }

    // Luôn so sánh bcrypt kể cả khi không tìm thấy user -> chống dò tài khoản qua thời gian phản hồi
    const dummyHash = '$2a$12$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(password, staff?.password_hash || dummyHash);

    if (!staff || !ok) {
      // GHI VẾT — trước đây chỉ ghi lần đăng nhập THÀNH CÔNG, nên không
      // phát hiện được khi hệ thống đang bị dò mật khẩu.
      await ghiThatBai(staff?.id ?? null, username, ip);

      /* Tăng bộ đếm và khoá tạm nếu vượt ngưỡng.
         Đây là lớp chặn theo TÀI KHOẢN — bổ sung cho lớp chặn theo IP.
         Kẻ tấn công đổi IP vẫn không vượt được lớp này. */
      let soLanSai = soLanSaiHienTai + 1;
      if (staff) {
        try {
          await pool.query('UPDATE staff SET failed_attempts = ? WHERE id = ?',
            [soLanSai, staff.id]);
        } catch { /* chưa nâng cấp v9 -> bỏ qua */ }
      }

      // Thông báo GIỐNG NHAU cho sai tên và sai mật khẩu -> không lộ tài khoản nào có thật.
      // Kèm cờ báo giao diện hiện ô captcha cho lần thử sau.
      return res.status(401).json({
        error: 'Tên đăng nhập hoặc mật khẩu không đúng.',
        canCaptcha: soLanSai >= SO_LAN_SAI_BAT_CAPTCHA,
      });
    }

    if (!staff.is_active) {
      await ghiThatBai(staff.id, username, ip);
      return res.status(403).json({ error: 'Tài khoản đã bị khoá.' });
    }

    // Đăng nhập đúng -> xoá bộ đếm sai
    try {
      await pool.query(
        'UPDATE staff SET failed_attempts = 0 WHERE id = ?',
        [staff.id]
      );
    } catch { /* chưa nâng cấp v9 -> bỏ qua */ }

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
      [staff.id, 'login', ip]
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
