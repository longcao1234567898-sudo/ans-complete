/**
 * CHẾ ĐỘ KI-ỐT — cán bộ nhập hộ ý kiến cho bà con TẠI TRỤ SỞ.
 *
 * VÌ SAO CẦN: nhiều bà con (lớn tuổi, không có điện thoại thông minh, không
 * có mạng, không biết chữ) đến thẳng trụ sở trình bày. Cán bộ mở máy tính ở
 * quầy tiếp dân, nghe và nhập hộ, in phiếu có mã tra cứu đưa bà con cầm về.
 *
 * KHÁC GÌ SO VỚI GỬI TRỰC TUYẾN:
 *   • KHÔNG cần OTP email — cán bộ đã gặp mặt, xác minh trực tiếp
 *   • KHÔNG áp hạn mức chống spam (cán bộ đang ngồi trước máy)
 *   • GHI NHẬT KÝ ai là người nhập hộ (truy trách nhiệm)
 *   • Ý kiến vào thẳng quy trình 'received', không qua kiểm duyệt
 *
 * Route này nằm sau requireAuth -> chỉ cán bộ đăng nhập mới gọi được.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { generateTrackingCode, sha256 } from '../../lib/helpers.js';
import { encrypt, hashPhone } from '../../lib/crypto.js';

const router = Router();

const CAT_CODE_TO_ID = { to_giac: 1, khieu_nai: 2, phan_anh: 3, de_xuat: 4 };

/**
 * POST /api/admin/kiosk/submit
 * Cán bộ nhập hộ ý kiến cho công dân đến trực tiếp trụ sở.
 */
router.post('/submit', async (req, res) => {
  const b = req.body || {};
  const content = String(b.content || '').trim();
  const category = String(b.category || '').trim();
  const fullName = String(b.fullName || '').trim();
  const phone = String(b.phone || '').trim();
  const wardId = b.wardId ? Number(b.wardId) : null;
  const urgency = ['normal', 'important', 'urgent'].includes(b.urgency) ? b.urgency : 'normal';

  // Kiểm tra tối thiểu
  if (content.length < 20) {
    return res.status(400).json({ error: 'Nội dung ý kiến phải từ 20 ký tự trở lên.' });
  }
  if (!CAT_CODE_TO_ID[category]) {
    return res.status(400).json({ error: 'Chưa chọn nhóm xử lý.' });
  }
  if (fullName.length < 2) {
    return res.status(400).json({ error: 'Chưa nhập họ tên công dân.' });
  }
  if (!/^0\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0.' });
  }

  try {
    // Sinh mã tra cứu không trùng
    let trackingCode = generateTrackingCode();
    for (let i = 0; i < 5; i++) {
      const [exist] = await pool.query('SELECT 1 FROM submissions WHERE tracking_code=?', [trackingCode]);
      if (exist.length === 0) break;
      trackingCode = generateTrackingCode();
    }

    // Hạn xử lý theo SLA của nhóm
    const catId = CAT_CODE_TO_ID[category];
    let slaDays = 15;
    try {
      const [[cat]] = await pool.query('SELECT sla_days FROM categories WHERE id=?', [catId]);
      if (cat?.sla_days) slaDays = cat.sla_days;
    } catch { /* chưa nâng cấp v2 -> mặc định */ }
    const deadlineAt = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

    // Lưu — danh tính MÃ HOÁ như mọi ý kiến khác
    const [result] = await pool.query(
      `INSERT INTO submissions
       (tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
        content_hash, sender_name, sender_phone, sender_phone_hash, sender_email,
        status, ip_address, user_agent, deadline_at, ward_id, is_verified_otp, is_anonymous, urgency)
       VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?)`,
      [
        trackingCode, content, content, catId, catId,
        sha256(content),
        encrypt(fullName),
        encrypt(phone),
        hashPhone(phone),
        null,
        'received',                       // vào thẳng quy trình, không qua kiểm duyệt
        'KIOSK',                          // đánh dấu nguồn: nhập tại trụ sở
        'Ki-ot tai tru so',
        deadlineAt,
        wardId,
        true,                             // cán bộ đã xác minh trực tiếp
        false,
        urgency,
      ]
    );

    // GHI NHẬT KÝ: ai là cán bộ nhập hộ (truy trách nhiệm khi cần)
    try {
      await pool.query(
        'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details, ip_address) VALUES (?,?,?,?,?,?)',
        [
          req.staff?.id ?? null,
          'kiosk_submit',
          'submission',
          result.insertId,
          `Nhập hộ tại trụ sở, mã ${trackingCode}`,
          req.ip || null,
        ]
      );
    } catch { /* chưa có bảng nhật ký -> bỏ qua */ }

    res.status(201).json({
      trackingCode,
      deadlineAt,
      slaDays,
      message: 'Đã tiếp nhận ý kiến. Bà con giữ mã tra cứu để theo dõi tiến độ.',
    });
  } catch (err) {
    console.error('Lỗi ki-ốt:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi lưu ý kiến. Cán bộ thử lại giúp.' });
  }
});

export default router;
