/** POST /api/submissions — nhận ý kiến mới, kiểm tra toàn bộ phía máy chủ */
import { Router } from 'express';
import { pool } from '../db.js';
import { generateTrackingCode, sha256 } from '../lib/helpers.js';
import {
  sanitizeText, scanTextForThreats, containsProfanity, getPhoneError, normalizePhone,
} from '../lib/security.js';

const router = Router();

const COOLDOWN_MS = 2 * 60_000;
const MAX_PER_HOUR = 5;
const CAT_CODE_TO_ID = { to_giac: 1, khieu_nai: 2, phan_anh: 3, de_xuat: 4 };

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

    // 1) Ràng buộc cơ bản
    if (!content) return res.status(400).json({ error: 'Nội dung ý kiến không được để trống.' });
    if (!CAT_CODE_TO_ID[category]) return res.status(400).json({ error: 'Nhóm xử lý không hợp lệ.' });
    if (!fullName) return res.status(400).json({ error: 'Vui lòng nhập họ và tên.' });

    // 2) Lá chắn văn bản
    const scan = scanTextForThreats(content);
    if (!scan.safe) return res.status(400).json({ error: `Nội dung chứa yếu tố không an toàn (${scan.reasons.join(', ')}).` });
    if (containsProfanity(content) || containsProfanity(fullName)) {
      return res.status(400).json({ error: 'Nội dung chứa ngôn từ không phù hợp. Vui lòng diễn đạt lịch sự.' });
    }

    // 3) Số điện thoại nghiêm ngặt
    const phoneErr = getPhoneError(phone);
    if (phoneErr) return res.status(400).json({ error: `Số điện thoại: ${phoneErr.toLowerCase()}.` });

    // 4) Chống spam theo IP/SĐT (server-side)
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim();
    const contentHash = sha256(normalizedContent);
    const [spam] = await pool.query(
      `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at,
              EXISTS(SELECT 1 FROM submissions WHERE content_hash=? AND created_at > NOW()-INTERVAL 1 HOUR) AS dup
       FROM submissions
       WHERE (ip_address=? OR sender_phone=?) AND created_at > NOW()-INTERVAL 1 HOUR`,
      [contentHash, ip, phone]
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

    // 6) Lưu ý kiến (trigger tự ghi lịch sử "Đã tiếp nhận")
    const catId = CAT_CODE_TO_ID[category];
    const [result] = await pool.query(
      `INSERT INTO submissions
       (tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
        content_hash, sender_name, sender_phone, sender_email, status, ip_address, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?, 'received', ?, ?)`,
      [trackingCode, content, normalizedContent, catId, catId, contentHash,
       fullName, phone, email || null, ip, (req.headers['user-agent'] || '').slice(0, 255)]
    );

    // 7) Lưu ảnh (đã tái mã hoá phía client) — bỏ qua nếu lỗi để không chặn ý kiến
    if (images.length > 0) {
      try {
        const values = images.map((url) => [result.insertId, String(url).slice(0, 500), 'image/jpeg', true, 'safe']);
        await pool.query(
          'INSERT INTO submission_images (submission_id, image_url, mime_type, is_verified, moderation_status) VALUES ?',
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
      contact: { fullName, phone, ...(email ? { email } : {}) },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Lỗi gửi ý kiến:', err);
    res.status(500).json({ error: 'Lỗi máy chủ khi gửi ý kiến.' });
  }
});

export default router;
