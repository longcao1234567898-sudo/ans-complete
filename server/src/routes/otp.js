/**
 * XÁC THỰC OTP QUA EMAIL — công dân phải xác thực trước khi gửi ý kiến.
 *
 * Luồng:
 *   1. POST /api/otp/send   {email}        -> gửi mã 6 số về email
 *   2. POST /api/otp/verify {email, code}  -> đúng thì cấp "vé" (otpToken)
 *   3. POST /api/submissions kèm otpToken  -> mới nhận ý kiến
 *
 * BẢO MẬT:
 *   - KHÔNG lưu email thật (chỉ băm SHA-256)
 *   - KHÔNG lưu mã OTP thật (chỉ băm bcrypt) -> lộ database cũng không biết mã
 *   - Sai quá 5 lần -> huỷ mã
 *   - Giới hạn gửi lại: 60 giây/lần, tối đa 5 mã/giờ/email
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { sendOtpEmail, mailConfigured } from '../lib/mailer.js';

const router = Router();

const OTP_TTL_MIN = 10;        // mã sống 10 phút
const RESEND_COOLDOWN_SEC = 60; // chờ 60s mới gửi lại
const MAX_PER_HOUR = 5;         // tối đa 5 mã/giờ
const MAX_ATTEMPTS = 5;         // sai quá 5 lần thì huỷ

const hashEmail = (e) => crypto.createHash('sha256').update(String(e).toLowerCase().trim()).digest('hex');
const genCode = () => String(crypto.randomInt(100000, 1000000)); // 6 số

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
}

/** POST /api/otp/send — gửi mã về email */
router.post('/send', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').slice(0, 45);

  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Email không đúng định dạng.' });
  }

  try {
    const eHash = hashEmail(email);

    // Chống spam gửi mã
    const [[stat]] = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at
       FROM otp_codes
       WHERE email_hash = ? AND created_at > NOW() - INTERVAL 1 HOUR`,
      [eHash]
    );

    if (stat.last_at) {
      const waited = (Date.now() - new Date(stat.last_at).getTime()) / 1000;
      if (waited < RESEND_COOLDOWN_SEC) {
        return res.status(429).json({
          error: `Vui lòng chờ ${Math.ceil(RESEND_COOLDOWN_SEC - waited)} giây trước khi gửi lại mã.`,
        });
      }
    }
    if (stat.cnt >= MAX_PER_HOUR) {
      return res.status(429).json({ error: 'Bà con đã yêu cầu quá nhiều mã. Vui lòng thử lại sau 1 giờ.' });
    }

    // Huỷ các mã cũ chưa dùng của email này
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email_hash = ? AND is_used = FALSE', [eHash]);

    // Sinh mã mới
    const code = genCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

    await pool.query(
      'INSERT INTO otp_codes (email_hash, code_hash, expires_at, ip_address) VALUES (?,?,?,?)',
      [eHash, codeHash, expiresAt, ip]
    );

    const result = await sendOtpEmail(email, code);

    let message;
    if (result.sent) {
      message = `Đã gửi mã xác thực đến ${email}. Vui lòng kiểm tra hộp thư (kể cả mục Spam).`;
    } else if (result.failed) {
      // Gửi mail hỏng -> KHÔNG chặn bà con, hiện mã ra màn hình để vẫn gửi được ý kiến
      message = 'Hệ thống email đang gặp sự cố. Mã xác thực của bà con hiển thị bên dưới.';
    } else {
      message = 'Hệ thống đang ở CHẾ ĐỘ DEMO (chưa cấu hình email).';
    }

    res.json({
      ok: true,
      message,
      expiresInMinutes: OTP_TTL_MIN,
      // Có khi: chưa cấu hình email, HOẶC gửi mail thất bại
      ...(result.devCode ? { devCode: result.devCode, demoMode: true } : {}),
    });
  } catch (err) {
    console.error('Lỗi gửi OTP:', err.message);
    res.status(500).json({ error: 'Không gửi được mã xác thực. Vui lòng thử lại.' });
  }
});

/** POST /api/otp/verify — kiểm tra mã, đúng thì cấp "vé" gửi ý kiến */
router.post('/verify', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();

  if (!validEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã xác thực phải gồm 6 chữ số.' });
  }

  try {
    const eHash = hashEmail(email);

    const [rows] = await pool.query(
      `SELECT id, code_hash, attempts FROM otp_codes
       WHERE email_hash = ? AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [eHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Mã đã hết hạn hoặc chưa được gửi. Vui lòng bấm "Gửi mã" lại.' });
    }

    const otp = rows[0];

    if (otp.attempts >= MAX_ATTEMPTS) {
      await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otp.id]);
      return res.status(429).json({ error: 'Bà con đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.' });
    }

    const ok = await bcrypt.compare(code, otp.code_hash);

    if (!ok) {
      await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
      const left = MAX_ATTEMPTS - (otp.attempts + 1);
      return res.status(400).json({
        error: left > 0
          ? `Mã xác thực không đúng. Bà con còn ${left} lần thử.`
          : 'Mã xác thực không đúng. Vui lòng yêu cầu mã mới.',
      });
    }

    // Đúng mã -> đánh dấu đã dùng, cấp "vé" 15 phút
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otp.id]);

    const otpToken = jwt.sign(
      { emailHash: eHash, purpose: 'submit' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      ok: true,
      otpToken,
      message: 'Xác thực thành công! Bà con có 15 phút để hoàn tất gửi ý kiến.',
    });
  } catch (err) {
    console.error('Lỗi xác thực OTP:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi xác thực.' });
  }
});

/** Hàm dùng chung: kiểm tra "vé" OTP có hợp lệ với email này không */
export function verifyOtpToken(otpToken, email) {
  if (!otpToken) return { ok: false, error: 'Bà con chưa xác thực email. Vui lòng bấm "Gửi mã xác thực".' };
  try {
    const payload = jwt.verify(otpToken, process.env.JWT_SECRET);
    if (payload.purpose !== 'submit') return { ok: false, error: 'Vé xác thực không hợp lệ.' };
    if (payload.emailHash !== hashEmail(email)) {
      return { ok: false, error: 'Email không khớp với email đã xác thực.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Xác thực đã hết hạn (15 phút). Vui lòng xác thực lại email.' };
  }
}

/* =====================================================================
   MÃ XÁC THỰC CHO Ý KIẾN ẨN DANH
   =====================================================================
   Ẩn danh không có email -> không gửi OTP được.
   Thay vào đó: máy chủ sinh mã 6 số, HIỂN THỊ ngay trên màn hình,
   bà con gõ lại để xác nhận.

   ⚠️ NÓI THẲNG VỀ MỨC BẢO MẬT: mã hiện trên màn hình nên bot đọc được.
   Đây KHÔNG phải lớp chống bot chính (đó là việc của CAPTCHA Turnstile).
   Giá trị thật của nó:
     - Buộc kẻ spam phải đi thêm 1 vòng gọi máy chủ (không thể gửi hàng loạt
       chỉ bằng 1 request)
     - Máy chủ đếm và CHẶN theo IP ngay từ bước xin mã
     - Cấp "vé" có hạn 15 phút -> không thể dùng lại mãi
     - Tạo ma sát, buộc người gửi đọc kỹ quy định trước khi gửi
   ===================================================================== */

const ANON_MAX_CODES_PER_DAY = 5; // xin mã tối đa 5 lần/ngày/IP

/** POST /api/otp/anon-code — sinh mã xác thực cho người gửi ẩn danh */
router.post('/anon-code', async (req, res) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').slice(0, 45);

  try {
    // Băm IP làm "danh tính" tạm (không lưu IP thô trong bảng OTP)
    const ipHash = crypto.createHash('sha256').update('anon:' + ip).digest('hex');

    const [[stat]] = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at
       FROM otp_codes
       WHERE email_hash = ? AND created_at > NOW() - INTERVAL 1 DAY`,
      [ipHash]
    );

    if (stat.cnt >= ANON_MAX_CODES_PER_DAY) {
      return res.status(429).json({
        error: `Mỗi thiết bị chỉ được xin tối đa ${ANON_MAX_CODES_PER_DAY} mã xác thực ẩn danh trong 24 giờ.`,
      });
    }
    if (stat.last_at) {
      const waited = (Date.now() - new Date(stat.last_at).getTime()) / 1000;
      if (waited < RESEND_COOLDOWN_SEC) {
        return res.status(429).json({
          error: `Vui lòng chờ ${Math.ceil(RESEND_COOLDOWN_SEC - waited)} giây trước khi xin mã mới.`,
        });
      }
    }

    // Huỷ mã cũ chưa dùng
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email_hash = ? AND is_used = FALSE', [ipHash]);

    const code = genCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

    await pool.query(
      'INSERT INTO otp_codes (email_hash, code_hash, expires_at, ip_address) VALUES (?,?,?,?)',
      [ipHash, codeHash, expiresAt, ip]
    );

    res.json({
      ok: true,
      code,                       // hiện thẳng lên màn hình (ô vàng)
      expiresInMinutes: OTP_TTL_MIN,
      message: 'Bà con hãy nhập lại mã bên dưới để xác nhận gửi tin báo ẩn danh.',
    });
  } catch (err) {
    console.error('Lỗi sinh mã ẩn danh:', err.message);
    res.status(500).json({ error: 'Không tạo được mã xác thực. Vui lòng thử lại.' });
  }
});

/** POST /api/otp/anon-verify — kiểm tra mã ẩn danh, cấp "vé" gửi ý kiến */
router.post('/anon-verify', async (req, res) => {
  const code = String(req.body?.code || '').trim();
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').slice(0, 45);

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã xác thực phải gồm 6 chữ số.' });
  }

  try {
    const ipHash = crypto.createHash('sha256').update('anon:' + ip).digest('hex');

    const [rows] = await pool.query(
      `SELECT id, code_hash, attempts FROM otp_codes
       WHERE email_hash = ? AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [ipHash]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Mã đã hết hạn. Vui lòng bấm "Lấy mã xác thực" lại.' });
    }

    const otp = rows[0];
    if (otp.attempts >= MAX_ATTEMPTS) {
      await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otp.id]);
      return res.status(429).json({ error: 'Nhập sai quá nhiều lần. Vui lòng lấy mã mới.' });
    }

    const ok = await bcrypt.compare(code, otp.code_hash);
    if (!ok) {
      await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
      const left = MAX_ATTEMPTS - (otp.attempts + 1);
      return res.status(400).json({
        error: left > 0 ? `Mã không đúng. Bà con còn ${left} lần thử.` : 'Mã không đúng. Vui lòng lấy mã mới.',
      });
    }

    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = ?', [otp.id]);

    const otpToken = jwt.sign(
      { emailHash: ipHash, purpose: 'submit_anon' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ ok: true, otpToken, message: 'Xác thực thành công! Bà con có 15 phút để hoàn tất gửi tin báo.' });
  } catch (err) {
    console.error('Lỗi xác thực mã ẩn danh:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi xác thực.' });
  }
});

/** Kiểm tra "vé" của người gửi ẩn danh (khớp theo IP) */
export function verifyAnonToken(otpToken, ip) {
  if (!otpToken) return { ok: false, error: 'Bà con chưa xác thực. Vui lòng bấm "Lấy mã xác thực".' };
  try {
    const payload = jwt.verify(otpToken, process.env.JWT_SECRET);
    if (payload.purpose !== 'submit_anon') return { ok: false, error: 'Vé xác thực không hợp lệ.' };
    const ipHash = crypto.createHash('sha256').update('anon:' + ip).digest('hex');
    if (payload.emailHash !== ipHash) {
      return { ok: false, error: 'Thiết bị không khớp với lượt xác thực. Vui lòng lấy mã mới.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Xác thực đã hết hạn (15 phút). Vui lòng lấy mã mới.' };
  }
}

export { mailConfigured };
export default router;
