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
import crypto from 'node:crypto';
import { requireAuth } from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { generateTrackingCode, sha256, ghiNhatKy } from '../../lib/helpers.js';
import { encrypt, hashPhone, encryptionEnabled, encryptionProblem } from '../../lib/crypto.js';
import { bamPin } from '../../lib/bam-pin.js';
import {
  sanitizeText, normalizePhone, getPhoneError, scanTextForThreats, containsProfanity,
} from '../../lib/security.js';
import { kiemTraNoiDungNham } from '../../lib/noi-dung-nham.js';
import { danhGiaMucKhan } from '../../lib/phan-loai.js';
import { nhanDienToGiacMat } from '../../lib/to-giac-mat.js';
import { coCotCo } from '../../lib/pham-vi-ho-so.js';

const router = Router();

/* 🔒 Bắt buộc đăng nhập.
   Trước đây file này import requireAuth nhưng KHÔNG BAO GIỜ GỌI, khiến toàn bộ
   đường dẫn ở đây mở cho bất kỳ ai trên Internet. /api/admin đã chặn chung ở
   routes/admin/index.js, dòng này là lớp thứ hai — phòng khi router được gắn
   ở chỗ khác. */
router.use(requireAuth);

const CAT_CODE_TO_ID = { to_giac: 1, khieu_nai: 2, phan_anh: 3, de_xuat: 4 };

/**
 * POST /api/admin/kiosk/submit
 * Cán bộ nhập hộ ý kiến cho công dân đến trực tiếp trụ sở.
 */
router.post('/submit', async (req, res) => {
  const b = req.body || {};
  const content = sanitizeText(b.content, 5000);
  const category = String(b.category || '').trim();
  const fullName = sanitizeText(b.fullName, 100);
  const phone = normalizePhone(b.phone);
  const rawWard = Number(b.wardId);
  const wardId = Number.isInteger(rawWard) && rawWard > 0 ? rawWard : null;
  /* Cùng luật với tin người dân tự gửi (ADR-003 việc 10): mức khẩn theo nội dung */
  const urgency = danhGiaMucKhan(content).muc;

  // 🔒 Ki-ốt LUÔN có danh tính (cán bộ nhập hộ tại trụ sở) -> khoá hỏng là chặn ngay.
  if (!encryptionEnabled()) {
    console.error('🔴 TỪ CHỐI nhận ý kiến ki-ốt —', encryptionProblem());
    return res.status(503).json({
      error:
        'Không lưu được ý kiến: chức năng mã hoá danh tính đang gặp sự cố. '
        + 'Đề nghị đồng chí báo quản trị viên kiểm tra ENCRYPTION_KEY trước khi tiếp tục nhập.',
      code: 'ENCRYPTION_UNAVAILABLE',
    });
  }

  // Kiểm tra tối thiểu & lá chắn đầu vào như luồng công khai
  if (content.length < 20) {
    return res.status(400).json({ error: 'Nội dung ý kiến phải từ 20 ký tự trở lên.' });
  }
  const scan = scanTextForThreats(content);
  if (!scan.safe) {
    return res.status(400).json({ error: `Nội dung chứa yếu tố không an toàn (${scan.reasons.join(', ')}).` });
  }
  if (containsProfanity(content) || containsProfanity(fullName)) {
    return res.status(400).json({ error: 'Nội dung chứa ngôn từ không phù hợp. Vui lòng diễn đạt lịch sự.' });
  }
  const nham = kiemTraNoiDungNham(content);
  if (nham.nham) {
    return res.status(400).json({
      error: 'Nội dung chưa rõ ràng. Đề nghị đồng chí ghi cụ thể sự việc: xảy ra ở đâu, khi nào, ai liên quan.',
    });
  }
  if (!CAT_CODE_TO_ID[category]) {
    return res.status(400).json({ error: 'Chưa chọn nhóm xử lý.' });
  }
  if (fullName.length < 2) {
    return res.status(400).json({ error: 'Chưa nhập họ tên công dân.' });
  }
  const phoneErr = getPhoneError(phone);
  if (phoneErr) {
    return res.status(400).json({ error: `Số điện thoại: ${phoneErr.toLowerCase()}.` });
  }

  try {
    // Sinh mã tra cứu không trùng
    let trackingCode = generateTrackingCode();
    for (let i = 0; i < 5; i++) {
      const [exist] = await pool.query('SELECT 1 FROM submissions WHERE tracking_code=?', [trackingCode]);
      if (exist.length === 0) break;
      trackingCode = generateTrackingCode();
    }

    // Sinh mã PIN 6 số an toàn để người nộp tại trụ sở dùng được phòng trao đổi / bổ sung
    const chatPin = String(crypto.randomInt(100000, 1_000_000));
    const chatPinHash = await bamPin(chatPin);

    // Hạn xử lý theo SLA của nhóm
    const catId = CAT_CODE_TO_ID[category];
    let slaDays = 15;
    try {
      const [[cat]] = await pool.query('SELECT sla_days FROM categories WHERE id=?', [catId]);
      if (cat?.sla_days) slaDays = cat.sla_days;
    } catch { /* chưa nâng cấp v2 -> mặc định */ }
    const deadlineAt = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

    /* Tố cáo cán bộ, người nhà nước -> gắn cờ ngay trong câu INSERT, như tin
       người dân tự gửi (ADR-003 việc 12): người nhập hộ cũng có thể là người
       bị tố cáo, hoặc đồng nghiệp của người đó. */
    const coCotMat = await coCotCo();
    const toGiacMat = nhanDienToGiacMat(content).mat;

    // Lưu — danh tính MÃ HOÁ như mọi ý kiến khác
    const giaTriCoBan = [
      trackingCode, content, content, catId, catId,
      sha256(content.trim().toLowerCase().replace(/\s+/g, ' ')),
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
    ];
    let result;
    let daLuuPin = true;
    try {
      [result] = await pool.query(
        `INSERT INTO submissions
         (tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
          content_hash, sender_name, sender_phone, sender_phone_hash, sender_email,
          status, ip_address, user_agent, deadline_at, ward_id, is_verified_otp, is_anonymous, urgency, chat_pin_hash${coCotMat ? ', to_giac_mat' : ''})
         VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?${coCotMat ? ', ?' : ''})`,
        [...giaTriCoBan, chatPinHash, ...(coCotMat ? [toGiacMat ? 1 : 0] : [])]
      );
    } catch (e) {
      if (!/chat_pin_hash/i.test(String(e?.message || ''))) throw e;
      daLuuPin = false;
      [result] = await pool.query(
        `INSERT INTO submissions
         (tracking_code, original_content, ai_processed_content, category_id, ai_suggested_category_id,
          content_hash, sender_name, sender_phone, sender_phone_hash, sender_email,
          status, ip_address, user_agent, deadline_at, ward_id, is_verified_otp, is_anonymous, urgency${coCotMat ? ', to_giac_mat' : ''})
         VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?${coCotMat ? ', ?' : ''})`,
        [...giaTriCoBan, ...(coCotMat ? [toGiacMat ? 1 : 0] : [])]
      );
    }

    // GHI NHẬT KÝ: ai là cán bộ nhập hộ (truy trách nhiệm khi cần)
    /* req.staff LUÔN tồn tại (requireAuth ở router cha). Ghi staff_id = NULL
       như bản cũ là mất khả năng truy trách nhiệm ai đã nhập hộ. Đi qua
       ghiNhatKy: cột details là JSON, chuỗi trần bị MySQL từ chối. */
    await ghiNhatKy(pool, req, {
      hanhDong: 'kiosk_submit', loaiDoiTuong: 'submission', doiTuongId: result.insertId,
      chiTiet: { maTraCuu: trackingCode },
    });

    res.status(201).json({
      trackingCode,
      ...(daLuuPin ? { chatPin } : {}),
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
