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
import { layIpThat } from '../lib/helpers.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { sendOtpEmail, mailConfigured } from '../lib/mailer.js';
/* Dùng CHUNG khoá đã qua kiểm tra của lib/token.js, không đọc thẳng
   JWT_SECRET. Đọc thẳng là bỏ qua toàn bộ phép kiểm tra ở đó
   (độ dài, chuỗi mặc định, entropy) — vé OTP sẽ được ký bằng một khoá yếu
   mà không có gì báo động. */
import { JWT_SECRET } from '../lib/token.js';

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
  const ip = layIpThat(req);

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

    // Gửi mail HỎNG (hệ thống đã cấu hình email) -> BÁO LỖI, tuyệt đối không hiện mã.
    // Hiện mã ra màn hình = ai cũng xác thực được email người khác.
    if (result.failed) {
      await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE email_hash = ? AND is_used = FALSE', [eHash]);
      return res.status(502).json({
        error: 'Hệ thống chưa gửi được mã xác thực đến email này. Bà con vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau ít phút.',
      });
    }

    res.json({
      ok: true,
      message: result.sent
        ? `Đã gửi mã xác thực đến ${email}. Vui lòng kiểm tra hộp thư (kể cả mục Spam).`
        : 'Hệ thống đang ở CHẾ ĐỘ DEMO (máy chủ chưa cấu hình email).',
      expiresInMinutes: OTP_TTL_MIN,
      // devCode CHỈ tồn tại khi máy chủ HOÀN TOÀN chưa cấu hình email (chạy thử ở máy cá nhân).
      // Trên bản chạy thật đã có Brevo -> không bao giờ có trường này.
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
      JWT_SECRET,
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
    const payload = jwt.verify(otpToken, JWT_SECRET, { algorithms: ['HS256'] });
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

/* ---------------------------------------------------------------------------
   HẠN MỨC CHO LUỒNG ẨN DANH

   ⚠️ KHÁC HẲN LUỒNG EMAIL — đừng đặt chung con số.

   Luồng email: mỗi lần xin mã là GỬI MỘT THƯ THẬT, tốn hạn mức Brevo và có
   thể bị lạm dụng để quấy rối hộp thư người khác. Nên siết chặt là đúng.

   Luồng ẩn danh: mã hiện THẲNG TRÊN MÀN HÌNH, không gửi đi đâu, không tốn
   gì cả. Siết như email chỉ làm khó bà con mà không ngăn được gì.

   ⚠️ VÌ SAO KHÔNG SIẾT CHẶT THEO IP ĐƯỢC:
   Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm, có khi hàng nghìn thuê
   bao cùng ra Internet bằng MỘT địa chỉ IP công cộng. Đặt "5 mã/ngày/IP"
   nghĩa là cả một vùng thuê bao Viettel chỉ được xin 5 mã mỗi ngày.
   Bà con ở quê phần lớn vào bằng 4G — đúng nhóm bị chặn oan nhiều nhất.
   --------------------------------------------------------------------------- */
const ANON_MAX_CODES_PER_DAY = 50;  // nới từ 5 -> 50 vì lý do CGNAT ở trên
const ANON_COOLDOWN_SEC = 10;       // nới từ 60s -> 10s: mã không gửi email

/** POST /api/otp/anon-code — sinh mã xác thực cho người gửi ẩn danh */
router.post('/anon-code', async (req, res) => {
  const ip = layIpThat(req);

  try {
    /* ====================================================================
       KHOÁ THEO MÃ PHIÊN, KHÔNG KHOÁ THEO IP

       ⚠️ LỖI CŨ: cả lúc cấp mã lẫn lúc kiểm mã đều tra cứu bằng
       sha256('anon:' + IP). Nếu địa chỉ IP đổi giữa hai lần gọi thì không
       tìm thấy dòng nào, hệ thống báo "Mã đã hết hạn" dù bà con vừa lấy mã
       xong và nhập đúng.

       IP đổi giữa chừng là chuyện RẤT HAY XẢY RA:
         · Mạng 4G/5G xoay IP liên tục
         · Nhà mạng dùng chung IP cho nhiều thuê bao (CGNAT)
         · Trình duyệt lúc đi IPv4 lúc đi IPv6

       Triệu chứng thực tế: nhập mã lần 1, lần 2 báo lỗi, lần 3 lại được —
       tuỳ lúc đó IP có trùng với lúc lấy mã hay không.

       NAY: máy chủ sinh một MÃ PHIÊN ngẫu nhiên, trả về cho trình duyệt.
       Trình duyệt gửi lại mã phiên đó khi xác nhận. Mã phiên không đổi theo
       mạng nên không còn phụ thuộc IP.

       IP vẫn dùng, nhưng CHỈ để đếm hạn mức chống lạm dụng — việc đó dù có
       sai lệch đôi chút cũng không chặn oan bà con.
       ==================================================================== */
    const anonId = crypto.randomBytes(24).toString('hex');
    const anonHash = crypto.createHash('sha256').update('anon:' + anonId).digest('hex');

    /* Đếm hạn mức theo IP thô ở cột ip_address — không dùng cho việc tra mã */
    const [[stat]] = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at
       FROM otp_codes
       WHERE ip_address = ? AND created_at > NOW() - INTERVAL 1 DAY`,
      [ip]
    );

    if (stat.cnt >= ANON_MAX_CODES_PER_DAY) {
      return res.status(429).json({
        error: `Mỗi thiết bị chỉ được xin tối đa ${ANON_MAX_CODES_PER_DAY} mã xác thực ẩn danh trong 24 giờ.`,
      });
    }
    if (stat.last_at) {
      const waited = (Date.now() - new Date(stat.last_at).getTime()) / 1000;
      if (waited < ANON_COOLDOWN_SEC) {
        return res.status(429).json({
          error: `Vui lòng chờ ${Math.ceil(ANON_COOLDOWN_SEC - waited)} giây trước khi xin mã mới.`,
        });
      }
    }

    /* ----------------------------------------------------------------------
       HUỶ MÃ CŨ — CHỈ HUỶ MÃ CỦA CHÍNH PHIÊN NÀY

       ⚠️ TRƯỚC ĐÂY DÒNG NÀY LÀ:
           UPDATE otp_codes SET is_used = TRUE WHERE ip_address = ? ...

       Đó là lỗi nghiêm trọng. Nhà mạng di động dùng CGNAT nên hàng trăm thuê
       bao chung một IP. Hệ quả thực tế:

         1. Bà con A xin mã   -> hệ thống ghi mã A
         2. Bà con B (cùng IP nhà mạng) xin mã -> HUỶ LUÔN MÃ CỦA A
         3. Bà con A nhập mã, bấm Xác nhận -> "Mã đã hết hạn"

       Bà con A không làm gì sai, mã vẫn đang hiện trên màn hình, mà bấm vào
       lại báo hết hạn. Thử lại vài lần thì "tự nhiên được" — đúng lúc không
       có ai khác cùng IP xin mã. Rất khó lần ra vì không tái hiện được khi
       ngồi thử một mình.

       Nay chỉ huỷ mã của ĐÚNG phiên trước đó, do chính trình duyệt gửi lên.
       Không gửi cũng không sao: mã tự hết hạn sau 10 phút và chỉ dùng 1 lần.
       ---------------------------------------------------------------------- */
    const phienTruoc = String(req.body?.prevAnonId || '').trim();
    if (/^[0-9a-f]{48}$/.test(phienTruoc)) {
      const hashTruoc = crypto.createHash('sha256').update('anon:' + phienTruoc).digest('hex');
      await pool.query(
        'UPDATE otp_codes SET is_used = TRUE WHERE email_hash = ? AND is_used = FALSE',
        [hashTruoc]
      );
    }

    const code = genCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

    await pool.query(
      'INSERT INTO otp_codes (email_hash, code_hash, expires_at, ip_address) VALUES (?,?,?,?)',
      [anonHash, codeHash, expiresAt, ip]
    );

    res.json({
      ok: true,
      code,                       // hiện thẳng lên màn hình (ô vàng)
      anonId,                     // trình duyệt giữ, gửi lại khi xác nhận
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
  const anonId = String(req.body?.anonId || '').trim();

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã xác thực phải gồm 6 chữ số.' });
  }
  if (!/^[0-9a-f]{48}$/.test(anonId)) {
    return res.status(400).json({ error: 'Phiên xác thực không hợp lệ. Vui lòng bấm "Lấy mã xác thực" lại.' });
  }

  try {
    /* Tra theo MÃ PHIÊN, không theo IP — xem giải thích ở route cấp mã */
    const anonHash = crypto.createHash('sha256').update('anon:' + anonId).digest('hex');

    const [rows] = await pool.query(
      `SELECT id, code_hash, attempts FROM otp_codes
       WHERE email_hash = ? AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [anonHash]
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
      { emailHash: anonHash, purpose: 'submit_anon' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ ok: true, otpToken, message: 'Xác thực thành công! Bà con có 15 phút để hoàn tất gửi tin báo.' });
  } catch (err) {
    console.error('Lỗi xác thực mã ẩn danh:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi xác thực.' });
  }
});

/** Kiểm tra "vé" của người gửi ẩn danh.
 *
 *  Khớp theo MÃ PHIÊN chứ không theo IP. Trước đây khớp theo IP nên vé vừa
 *  cấp xong đã dùng không được nếu mạng đổi IP giữa chừng — chuyện rất hay
 *  xảy ra trên 4G và ở nhà mạng dùng chung IP.
 */
export function verifyAnonToken(otpToken, anonId) {
  if (!otpToken) return { ok: false, error: 'Bà con chưa xác thực. Vui lòng bấm "Lấy mã xác thực".' };
  try {
    const payload = jwt.verify(otpToken, JWT_SECRET, { algorithms: ['HS256'] });
    if (payload.purpose !== 'submit_anon') return { ok: false, error: 'Vé xác thực không hợp lệ.' };
    const anonHash = crypto.createHash('sha256').update('anon:' + String(anonId || '')).digest('hex');
    if (payload.emailHash !== anonHash) {
      return { ok: false, error: 'Phiên xác thực không khớp. Vui lòng bấm "Lấy mã xác thực" lại.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Xác thực đã hết hạn (15 phút). Vui lòng lấy mã mới.' };
  }
}

export { mailConfigured };
export default router;
