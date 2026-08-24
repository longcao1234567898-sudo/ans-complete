/**
 * CHAT VÀ DANH SÁCH KHOÁ — PHÍA CÁN BỘ
 * ============================================================================
 * Đường dẫn gắn dưới /api/admin nên đã qua requireAuth ở routes/admin/index.js.
 * Vẫn gắn thêm requireAuth ở đây làm lớp thứ hai — phòng khi router này được
 * dùng ở chỗ khác. Bài học từ lần trash.js và kiosk.js quên chặn.
 */

import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { sanitizeText } from '../../lib/security.js';
import { goKhoa } from '../../lib/chan-spam.js';
import { layIpThat } from '../../lib/helpers.js';

const router = Router();
router.use(requireAuth);

const MAX_DAI_TIN = 1000;

/* Trạng thái nào thì còn chat được — PHẢI khớp với routes/chat.js.
   Lệch nhau thì cán bộ gửi được mà người dân không trả lời được, hoặc ngược lại. */
const TRANG_THAI_DUOC_CHAT = ['received', 'processing', 'pending_review'];
const chatDaDong = (st) => !TRANG_THAI_DUOC_CHAT.includes(st);

/* ==========================================================================
   XEM TIN NHẮN CỦA MỘT HỒ SƠ
   ========================================================================== */
router.get('/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  }

  try {
    const [[don]] = await pool.query(
      'SELECT status, is_anonymous FROM submissions WHERE id = ? LIMIT 1',
      [id]
    );
    if (!don) return res.status(404).json({ error: 'Không tìm thấy hồ sơ.' });

    const [tin] = await pool.query(
      `SELECT m.id, m.sender_type, m.message, m.created_at, st.full_name AS staff_name
         FROM report_messages m
         LEFT JOIN staff st ON st.id = m.staff_id
        WHERE m.submission_id = ?
        ORDER BY m.created_at ASC
        LIMIT 200`,
      [id]
    );

    /* Đánh dấu cán bộ đã đọc hết tin của người dân -> tắt chấm đỏ */
    await pool.query(
      `UPDATE report_messages SET read_by_staff = 1
        WHERE submission_id = ? AND sender_type = 'reporter' AND read_by_staff = 0`,
      [id]
    ).catch(() => {});

    res.json({
      messages: tin,
      status: don.status,
      daDong: chatDaDong(don.status),
      isAnonymous: Boolean(don.is_anonymous),
    });
  } catch (err) {
    console.error('Đọc tin nhắn (cán bộ) lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được tin nhắn. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

/* ==========================================================================
   CÁN BỘ GỬI TIN NHẮN
   ========================================================================== */
router.post('/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  const noiDung = sanitizeText(req.body?.message || '', MAX_DAI_TIN);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  }
  if (!noiDung || noiDung.trim().length < 2) {
    return res.status(400).json({ error: 'Chưa nhập nội dung.' });
  }

  try {
    const [[don]] = await pool.query(
      'SELECT status FROM submissions WHERE id = ? LIMIT 1',
      [id]
    );
    if (!don) return res.status(404).json({ error: 'Không tìm thấy hồ sơ.' });

    /* Cùng luật với phía người dân: hồ sơ đóng thì không ai chat thêm được,
       kể cả cán bộ. Nếu chỉ chặn một bên thì bên kia nhắn vào khoảng không. */
    if (chatDaDong(don.status)) {
      return res.status(403).json({
        error: 'Hồ sơ đã đóng. Muốn trao đổi tiếp, cần chuyển hồ sơ về trạng thái đang xử lý.',
      });
    }

    await pool.query(
      `INSERT INTO report_messages (submission_id, sender_type, staff_id, message, read_by_staff)
       VALUES (?, 'staff', ?, ?, 1)`,
      [id, req.staff?.id || null, noiDung]
    );

    /* Ghi nhật ký: cán bộ nào hỏi thêm gì, lúc nào. Cần cho việc kiểm tra
       nội bộ — chat với người tố giác là việc nhạy cảm. */
    await pool.query(
      `INSERT INTO staff_activity_logs (staff_id, action, target_id, ip_address)
       VALUES (?, 'chat_message', ?, ?)`,
      [req.staff?.id || null, id, layIpThat(req)]
    ).catch(() => {});

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Gửi tin nhắn (cán bộ) lỗi:', err.message);
    res.status(500).json({ error: 'Không gửi được tin nhắn.' });
  }
});

/* ==========================================================================
   DANH SÁCH KHOÁ — chỉ admin và manager
   ========================================================================== */
router.get('/blacklist', authorize('admin', 'manager'), async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vw_blacklist_active');
    res.json(rows);
  } catch (err) {
    console.error('Đọc danh sách khoá lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được danh sách. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

/* Gỡ khoá — dùng khi biết đã chặn oan.
   Rất cần thiết vì mã thiết bị có thể đổi chủ: máy ở tiệm net, điện thoại
   mượn của người thân. */
router.delete('/blacklist/:id', authorize('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mã không hợp lệ.' });
  }
  try {
    const xong = await goKhoa(pool, id);
    if (!xong) return res.status(404).json({ error: 'Không tìm thấy mục khoá này.' });

    await pool.query(
      `INSERT INTO staff_activity_logs (staff_id, action, target_id, ip_address)
       VALUES (?, 'unblock_device', ?, ?)`,
      [req.staff?.id || null, id, layIpThat(req)]
    ).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('Gỡ khoá lỗi:', err.message);
    res.status(500).json({ error: 'Không gỡ khoá được.' });
  }
});

/* ============================================================================
   THIẾT BỊ TIN CẬY — miễn khoá tự động cho máy dùng chung

   Máy kiosk, máy tính bảng ở nhà văn hoá, máy tại điểm hỗ trợ lưu động: nhiều
   người dùng chung một device_id. Đánh dấu tin cậy để một người gửi tin rác
   không khoá cả máy, chặn oan mọi người sau đó. Chỉ admin/manager thao tác. */
router.get('/trusted-devices', authorize('admin', 'manager'), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, identifier, reason, created_at
         FROM blacklists WHERE kind = 'trusted_device'
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Đọc thiết bị tin cậy lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được danh sách. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

router.post('/trusted-devices', authorize('admin', 'manager'), async (req, res) => {
  const deviceId = String(req.body?.deviceId || '').trim().toLowerCase();
  const ghiChu = String(req.body?.ghiChu || '').trim().slice(0, 200);
  if (deviceId.length < 8) {
    return res.status(400).json({ error: 'Mã thiết bị không hợp lệ (quá ngắn).' });
  }
  try {
    /* Dùng expires_at rất xa (100 năm) vì cột NOT NULL, nhưng bản chất là
       không hết hạn. kiemTraBiKhoa lọc theo kind nên không cần xét hạn ở đây. */
    await pool.query(
      `INSERT INTO blacklists (identifier, kind, reason, created_by, expires_at)
       VALUES (?, 'trusted_device', ?, ?, DATE_ADD(NOW(), INTERVAL 100 YEAR))
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_by = VALUES(created_by)`,
      [deviceId, ghiChu || 'Máy dùng chung tại trụ sở/điểm hỗ trợ', req.staff?.id || null]
    );
    await pool.query(
      `INSERT INTO staff_activity_logs (staff_id, action, details, ip_address)
       VALUES (?, 'trust_device', ?, ?)`,
      [req.staff?.id || null, `Đánh dấu tin cậy thiết bị ${deviceId.slice(0, 12)}…`, layIpThat(req)]
    ).catch(() => {});
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Thêm thiết bị tin cậy lỗi:', err.message);
    res.status(500).json({ error: 'Không thêm được. Đã chạy nang_cap_v12.sql chưa?' });
  }
});

router.delete('/trusted-devices/:id', authorize('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  try {
    const [kq] = await pool.query(
      `DELETE FROM blacklists WHERE id = ? AND kind = 'trusted_device'`, [id]
    );
    if (!kq.affectedRows) return res.status(404).json({ error: 'Không tìm thấy.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Bỏ thiết bị tin cậy lỗi:', err.message);
    res.status(500).json({ error: 'Không bỏ được.' });
  }
});

export default router;
