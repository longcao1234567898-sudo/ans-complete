/** POST /api/submissions — nhận ý kiến mới, kiểm tra toàn bộ phía máy chủ */
import { Router } from 'express';
import { pool } from '../db.js';
import { generateTrackingCode, sha256 } from '../lib/helpers.js';
import {
  sanitizeText, scanTextForThreats, containsProfanity, getPhoneError, normalizePhone,
} from '../lib/security.js';
import { encrypt, hashPhone } from '../lib/crypto.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { verifyOtpToken } from './otp.js';

const router = Router();

const COOLDOWN_MS = 2 * 60_000;
const MAX_PER_HOUR = 5;
const CAT_CODE_TO_ID = { to_giac: 1, khieu_nai: 2, phan_anh: 3, de_xuat: 4 };

/** GET /api/submissions/wards — danh sách địa bàn cho ô chọn ở form */
router.get('/wards', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM wards ORDER BY display_order, name');
    res.json(rows);
  } catch {
    res.json([]); // chưa chạy nâng cấp v2 -> trả rỗng, form vẫn dùng được
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const content = sanitizeText(body.content);
    const fullName = sanitizeText(body.fullName, 100);
    const phone = normalizePhone(body.phone);
    const email = sanitizeText(body.email || '', 100);
    const category = body.category;
    const normalizedContent = sanitizeText(body.normalizedContent || content, 2500);
    const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
    const wardId = Number(body.wardId) > 0 ? Number(body.wardId) : null;
    const isAnonymous = body.isAnonymous === true;

    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();

    // 0) CAPTCHA chống bot (bỏ qua nếu chưa cấu hình khoá)
    const captcha = await verifyTurnstile(body.captchaToken, ip);
    if (!captcha.ok) return res.status(400).json({ error: captcha.error });

    // 1) Ràng buộc cơ bản
    if (!content) return res.status(400).json({ error: 'Nội dung ý kiến không được để trống.' });
    if (!CAT_CODE_TO_ID[category]) return res.status(400).json({ error: 'Nhóm xử lý không hợp lệ.' });
    // ẨN DANH: bỏ yêu cầu danh tính + OTP (bảo vệ người tố giác).
    // Chống spam vẫn hoạt động qua IP + băm nội dung.
    if (!isAnonymous) {
      if (!fullName) return res.status(400).json({ error: 'Vui lòng nhập họ và tên.' });
      if (!email) return res.status(400).json({ error: 'Vui lòng nhập email để nhận mã xác thực.' });

      const otpCheck = verifyOtpToken(body.otpToken, email);
      if (!otpCheck.ok) return res.status(401).json({ error: otpCheck.error });
    }

    // 2) Lá chắn văn bản
    const scan = scanTextForThreats(content);
    if (!scan.safe) return res.status(400).json({ error: `Nội dung chứa yếu tố không an toàn (${scan.reasons.join(', ')}).` });
    if (containsProfanity(content) || containsProfanity(fullName)) {
      return res.status(400).json({ error: 'Nội dung chứa ngôn từ không phù hợp. Vui lòng diễn đạt lịch sự.' });
    }

    // 3) Số điện thoại nghiêm ngặt
    const phoneErr = isAnonymous ? null : getPhoneError(phone);
    if (phoneErr) return res.status(400).json({ error: `Số điện thoại: ${phoneErr.toLowerCase()}.` });

    // 4) Chống spam — dò theo IP và BĂM SĐT (số thật đã mã hoá nên không so trực tiếp được)
    const contentHash = sha256(normalizedContent);
    const phoneHash = isAnonymous ? null : hashPhone(phone);
    const [spam] = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at,
              EXISTS(SELECT 1 FROM submissions WHERE content_hash=? AND created_at > NOW()-INTERVAL 1 HOUR) AS dup
       FROM submissions
       WHERE (ip_address=? OR (sender_phone_hash IS NOT NULL AND sender_phone_hash=?)) AND created_at > NOW()-INTERVAL 1 HOUR`,
      [contentHash, ip, phoneHash || '__none__']
    );
    const info = spam[0];
    if (info.dup) return res.status(429).json({ error: 'Nội dung này bà con vừa gửi rồi. Vui lòng dùng mã tra cứu đã cấp để theo dõi.' });
    if (info.last_at && Date.now() - new Date(info.last_at).getTime() < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(info.last_at).getTime())) / 1000);
      return res.status(429).json({ error: `Bà con vừa gửi một ý kiến. Vui lòng chờ thêm ${waitSec} giây.` });
    }
    if (info.cnt >= MAX_PER_HOUR) {
      return res.status(429).json({ error: `Mỗi thiết bị chỉ được gửi tối đa ${MAX_PER_HOUR} ý kiến trong 1 giờ.` });
    }

    // 5) Sinh mã tra cứu không trùng
    let trackingCode = generateTrackingCode();
    for (let i = 0; i < 5; i++) {
      const [exist] = await pool.query('SELECT 1 FROM submissions WHERE tracking_code=?', [trackingCode]);
      if (exist.length === 0) break;
      trackingCode = generateTrackingCode();
    }

    // 6) Tính HẠN XỬ LÝ (SLA) theo quy định của từng nhóm
    const catId = CAT_CODE_TO_ID[category];
    let slaDays = 15;
    try {
      const [[cat]] = await pool.query('SELECT sla_days FROM categories WHERE id=?', [catId]);
      if (cat?.sla_days) slaDays = cat.sla_days;
    } catch { /* chưa nâng cấp v2 -> dùng mặc định */ }
    const deadlineAt = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

    // 7) Lưu ý kiến — DANH TÍNH ĐƯỢC MÃ HOÁ (trigger tự ghi lịch sử "Đã tiếp nhận")
    const [result] = await pool.query(
      `INSERT INTO submissions
       (tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
        content_hash, sender_name, sender_phone, sender_phone_hash, sender_email,
        status, ip_address, user_agent, deadline_at, ward_id, is_verified_otp, is_anonymous)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'received', ?,?,?,?, ?, ?)`,
      [trackingCode, content, normalizedContent, catId, catId, contentHash,
       isAnonymous ? null : encrypt(fullName),
       isAnonymous ? null : encrypt(phone),
       phoneHash,
       isAnonymous || !email ? null : encrypt(email),
       ip, (req.headers['user-agent'] || '').slice(0, 255), deadlineAt, wardId,
       !isAnonymous, isAnonymous]
    );

    // 8) Lưu ảnh — bỏ qua nếu lỗi để không chặn ý kiến
    if (images.length > 0) {
      try {
        // Ảnh có thể là:
        //  - Link Cloudinary: { url, publicId }  -> lưu LINK (nhẹ, khuyên dùng)
        //  - Chuỗi base64 (cách cũ)              -> vẫn lưu được, nhưng phình database
        const values = images.map((img) => {
          if (typeof img === 'object' && img?.url) {
            return [result.insertId, String(img.url), img.publicId || null, 'cloudinary', 'image/jpeg', true, 'safe'];
          }
          return [result.insertId, String(img), null, 'base64', 'image/jpeg', true, 'safe'];
        });
        await pool.query(
          `INSERT INTO submission_images
           (submission_id, image_url, cloudinary_id, storage, mime_type, is_verified, moderation_status)
           VALUES ?`,
          [values]
        );
      } catch (e) {
        console.warn('Không lưu được ảnh đính kèm:', e.message);
      }
    }

    res.status(201).json({
      trackingCode,
      content,
      normalizedContent,
      category,
      contact: isAnonymous ? { fullName: 'Ẩn danh', phone: '' } : { fullName, phone, ...(email ? { email } : {}) },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Lỗi gửi ý kiến:', err);
    res.status(500).json({ error: 'Lỗi máy chủ khi gửi ý kiến.' });
  }
});

export default router;
