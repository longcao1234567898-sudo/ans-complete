/**
 * CHAT ẨN DANH HAI CHIỀU
 * ============================================================================
 *
 * VÌ SAO CẦN:
 * Bà con gửi tố giác ẩn danh xong là hết đường liên lạc. Cán bộ đọc thấy thiếu
 * thông tin — "đối tượng mặc áo màu gì", "khoảng mấy giờ", "xe biển số bao
 * nhiêu" — nhưng không hỏi lại được vì không có số điện thoại. Đơn đành xếp lại,
 * mà đó thường là những tin báo giá trị nhất.
 *
 * Kênh này giải bài toán đó mà KHÔNG phá vỡ tính ẩn danh.
 *
 * ---------------------------------------------------------------------------
 * BẢO ĐẢM VỀ QUYỀN RIÊNG TƯ:
 * Bảng report_messages chỉ lưu: nội dung tin nhắn, bên gửi là ai (cán bộ hay
 * người dân), và thời điểm. KHÔNG lưu tên, số điện thoại, email hay địa chỉ IP.
 * Cán bộ chat với người tố giác mà vẫn không biết đó là ai.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO VÀO PHÒNG CHAT CẦN THÊM MÃ PIN:
 * Mã tra cứu chỉ 6 ký tự và dùng để XEM tiến độ — lộ ra cũng chỉ biết đơn đang
 * ở bước nào. Phòng chat thì khác: trong đó có câu hỏi nghiệp vụ của cán bộ,
 * lộ ra là lộ hướng xác minh, và kẻ bị tố giác có thể mạo danh người báo tin
 * để đánh lạc hướng.
 *
 * Nên phải có THÊM mã PIN 6 số, cấp một lần lúc gửi đơn, database chỉ giữ bản
 * băm bcrypt.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { sanitizeText } from '../lib/security.js';
import { containsProfanity } from '../lib/security.js';

const router = Router();

/* Vé vào phòng chat sống 2 giờ — đủ cho một lượt trao đổi, hết thì nhập lại
   PIN. Không để dài hơn vì vé nằm trong trình duyệt, máy dùng chung thì người
   sau vào được. */
const VE_CHAT_TTL = '2h';

const MAX_DAI_TIN = 1000;

/* ---------------------------------------------------------------------------
   TRẠNG THÁI NÀO THÌ ĐƯỢC CHAT

   Hồ sơ đã giải quyết xong hoặc bị từ chối thì luồng xử lý đã khép lại. Cho
   chat tiếp sẽ sinh ra hai vấn đề:
     · Bà con nhắn vào khoảng không, không ai đọc — mất niềm tin
     · Kẻ xấu dùng làm chỗ nhồi dữ liệu rác vào database

   Chặn ở CẢ HAI LỚP: máy chủ trả 403, và giao diện khoá ô nhập. Chỉ khoá ở
   giao diện là không đủ — người biết dùng công cụ gọi API vẫn bắn tin vào được.
   --------------------------------------------------------------------------- */
const TRANG_THAI_DUOC_CHAT = ['received', 'processing', 'pending_review'];

function chatDaDong(status) {
  return !TRANG_THAI_DUOC_CHAT.includes(status);
}

/* Chống dò mã PIN: 5 lần thử sai / 15 phút cho mỗi IP.
   PIN chỉ 6 số nên không có giới hạn là dò ra trong vài phút. */
const gioiHanMoPhong = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bà con đã thử sai quá nhiều lần. Vui lòng chờ 15 phút.' },
});

/* Chống spam tin nhắn: 20 tin / 5 phút */
const gioiHanGuiTin = rateLimit({
  windowMs: 5 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bà con gửi hơi nhanh. Vui lòng chờ một chút.' },
});

/**
 * Xác thực vé của NGƯỜI DÂN.
 * Trả về submissionId nếu vé hợp lệ, ném lỗi nếu không.
 */
function kiemTraVeNguoiDan(req) {
  const ve = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || String(req.body?.chatToken || '').trim();
  if (!ve) throw new Error('Bà con chưa vào phòng chat.');

  const payload = jwt.verify(ve, process.env.JWT_SECRET);
  if (payload.purpose !== 'chat_reporter') throw new Error('Vé không hợp lệ.');
  return Number(payload.sub);
}

/* ==========================================================================
   1) MỞ PHÒNG CHAT — người dân nhập mã tra cứu + mã PIN
   ========================================================================== */
router.post('/open', gioiHanMoPhong, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const pin = String(req.body?.pin || '').trim();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Mã tra cứu gồm 6 ký tự.' });
  }
  if (!/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'Mã PIN gồm 6 chữ số.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, status, chat_pin_hash
         FROM submissions
        WHERE tracking_code = ? AND deleted_at IS NULL
        LIMIT 1`,
      [code]
    );

    /* Trả về CÙNG MỘT thông báo cho cả "không có mã" lẫn "sai PIN".
       Nếu tách riêng, kẻ xấu dò được mã tra cứu nào có thật rồi mới tập trung
       dò PIN cho mã đó. */
    const loiChung = { error: 'Mã tra cứu hoặc mã PIN không đúng.' };

    if (rows.length === 0) return res.status(401).json(loiChung);

    const don = rows[0];
    if (!don.chat_pin_hash) {
      return res.status(400).json({
        error: 'Ý kiến này gửi trước khi có kênh trao đổi nên không có mã PIN. '
             + 'Bà con vui lòng liên hệ trực tiếp số trực ban.',
      });
    }

    const dung = await bcrypt.compare(pin, don.chat_pin_hash);
    if (!dung) return res.status(401).json(loiChung);

    const ve = jwt.sign(
      { sub: don.id, purpose: 'chat_reporter' },
      process.env.JWT_SECRET,
      { expiresIn: VE_CHAT_TTL }
    );

    /* Đánh dấu người dân đã đọc hết tin của cán bộ */
    await pool.query(
      `UPDATE report_messages SET read_by_reporter = 1
        WHERE submission_id = ? AND sender_type = 'staff'`,
      [don.id]
    ).catch(() => { /* không quan trọng */ });

    res.json({
      chatToken: ve,
      trackingCode: code,
      status: don.status,
      daDong: chatDaDong(don.status),
    });
  } catch (err) {
    console.error('Mở phòng chat lỗi:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bà con thử lại sau.' });
  }
});

/* ==========================================================================
   2) NGƯỜI DÂN XEM TIN NHẮN
   ========================================================================== */
router.get('/messages', async (req, res) => {
  let submissionId;
  try {
    submissionId = kiemTraVeNguoiDan(req);
  } catch {
    return res.status(401).json({ error: 'Phiên trao đổi đã hết hạn. Bà con vào lại bằng mã PIN.' });
  }

  try {
    const [[don]] = await pool.query(
      'SELECT status FROM submissions WHERE id = ? LIMIT 1',
      [submissionId]
    );
    const [tin] = await pool.query(
      `SELECT id, sender_type, message, created_at
         FROM report_messages
        WHERE submission_id = ?
        ORDER BY created_at ASC
        LIMIT 200`,
      [submissionId]
    );

    await pool.query(
      `UPDATE report_messages SET read_by_reporter = 1
        WHERE submission_id = ? AND sender_type = 'staff' AND read_by_reporter = 0`,
      [submissionId]
    ).catch(() => {});

    res.json({
      messages: tin,
      status: don?.status || null,
      daDong: chatDaDong(don?.status),
    });
  } catch (err) {
    console.error('Đọc tin nhắn lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được tin nhắn.' });
  }
});

/* ==========================================================================
   3) NGƯỜI DÂN GỬI TIN NHẮN
   ========================================================================== */
router.post('/messages', gioiHanGuiTin, async (req, res) => {
  let submissionId;
  try {
    submissionId = kiemTraVeNguoiDan(req);
  } catch {
    return res.status(401).json({ error: 'Phiên trao đổi đã hết hạn. Bà con vào lại bằng mã PIN.' });
  }

  const noiDung = sanitizeText(req.body?.message || '', MAX_DAI_TIN);
  if (!noiDung || noiDung.trim().length < 2) {
    return res.status(400).json({ error: 'Bà con chưa nhập nội dung.' });
  }
  if (containsProfanity(noiDung)) {
    return res.status(400).json({ error: 'Nội dung có từ ngữ không phù hợp. Bà con vui lòng viết lại.' });
  }

  try {
    /* CHẶN TẠI GỐC: kiểm tra trạng thái TRƯỚC khi ghi vào database.
       Đây là lớp thật sự bảo vệ — giao diện khoá ô nhập chỉ là để bà con
       thấy rõ, người dùng công cụ gọi API vẫn đi thẳng vào đây. */
    const [[don]] = await pool.query(
      'SELECT status FROM submissions WHERE id = ? LIMIT 1',
      [submissionId]
    );
    if (!don) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (chatDaDong(don.status)) {
      return res.status(403).json({
        error: 'Hồ sơ đã đóng, không gửi thêm tin nhắn được. '
             + 'Nếu còn việc cần trình báo, bà con vui lòng gửi ý kiến mới.',
      });
    }

    await pool.query(
      `INSERT INTO report_messages (submission_id, sender_type, message, read_by_reporter)
       VALUES (?, 'reporter', ?, 1)`,
      [submissionId, noiDung]
    );

    /* Đẩy hồ sơ lên đầu danh sách của cán bộ — có tin mới thì phải thấy ngay */
    await pool.query(
      'UPDATE submissions SET updated_at = NOW() WHERE id = ?',
      [submissionId]
    ).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Gửi tin nhắn lỗi:', err.message);
    res.status(500).json({ error: 'Không gửi được tin nhắn.' });
  }
});

export default router;
