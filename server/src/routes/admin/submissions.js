/** API quản lý ý kiến cho cán bộ (yêu cầu đăng nhập) */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { decrypt, maskPhone, maskName } from '../../lib/crypto.js';

const router = Router();
router.use(requireAuth);

/** Tính tình trạng hạn xử lý (SLA) */
function slaOf(row) {
  if (!row.deadline_at) return { sla: 'none', daysLeft: null };
  if (row.status === 'resolved' || row.status === 'rejected') return { sla: 'done', daysLeft: null };
  const ms = new Date(row.deadline_at).getTime() - Date.now();
  const daysLeft = Math.ceil(ms / 86400000);
  if (ms < 0) return { sla: 'overdue', daysLeft };      // QUÁ HẠN
  if (daysLeft <= 3) return { sla: 'near', daysLeft };  // SẮP HẾT HẠN
  return { sla: 'ok', daysLeft };
}

/** GET /api/admin/submissions — danh sách + lọc + phân trang */
router.get('/', async (req, res) => {
  const { status, category, q, sla, assigned } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  } else {
    // Mặc định: ẩn tin CHỜ DUYỆT và tin RÁC khỏi danh sách xử lý chính
    // -> tin rác không bao giờ làm phiền quy trình nghiệp vụ
    where.push("s.status NOT IN ('pending_review','spam')");
  }
  if (category) { where.push('c.code = ?'); params.push(category); }
  if (q) { where.push('(s.original_content LIKE ? OR s.tracking_code = ?)'); params.push(`%${q}%`, String(q).toUpperCase()); }
  if (sla === 'overdue') where.push("s.status IN ('received','processing') AND s.deadline_at IS NOT NULL AND s.deadline_at < NOW()");
  if (sla === 'near') where.push("s.status IN ('received','processing') AND s.deadline_at >= NOW() AND s.deadline_at < NOW() + INTERVAL 3 DAY");
  if (assigned === 'me') { where.push('s.assigned_to = ?'); params.push(req.staff.id); }
  if (assigned === 'none') where.push('s.assigned_to IS NULL');
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              c.code AS category_code, c.name AS category_name,
              s.status, s.sender_name, s.is_flagged, s.created_at, s.is_anonymous, s.urgency,
              s.deadline_at, s.assigned_to,
              st.full_name AS assigned_name, w.name AS ward_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       LEFT JOIN wards w ON s.ward_id = w.id
       ${whereSql}
       ORDER BY FIELD(s.urgency,'urgent','important','normal'),
                (s.status IN ('received','processing') AND s.deadline_at < NOW()) DESC,
                s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM submissions s LEFT JOIN categories c ON s.category_id = c.id ${whereSql}`,
      params
    );
    // Giải mã tên rồi CHE BỚT — danh sách không bao giờ hiện danh tính đầy đủ
    const data = rows.map((r) => ({
      ...r,
      sender_name: r.is_anonymous ? '🕶️ Người gửi ẩn danh' : maskName(decrypt(r.sender_name)),
      ...slaOf(r),
    }));
    res.json({ data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Lỗi danh sách ý kiến:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** GET /api/admin/submissions/:id — chi tiết (danh tính CHE SẴN, muốn xem đủ phải bấm nút) */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, c.code AS category_code, c.name AS category_name, c.sla_days,
              st.full_name AS assigned_name, rb.full_name AS resolved_by_name,
              w.name AS ward_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       LEFT JOIN staff rb ON s.resolved_by = rb.id
       LEFT JOIN wards w ON s.ward_id = w.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });

    const [images] = await pool.query(
      'SELECT image_url, mime_type, moderation_status FROM submission_images WHERE submission_id = ?',
      [req.params.id]
    );
    const [history] = await pool.query(
      `SELECT h.old_status, h.new_status, h.note, h.changed_at, st.full_name AS changed_by_name
       FROM status_history h LEFT JOIN staff st ON h.changed_by = st.id
       WHERE h.submission_id = ? ORDER BY h.changed_at ASC`,
      [req.params.id]
    );

    const row = rows[0];
    const out = {
      ...row,
      sender_name: row.is_anonymous ? '🕶️ Người gửi ẩn danh' : maskName(decrypt(row.sender_name)),
      sender_phone: row.is_anonymous ? '(không cung cấp)' : maskPhone(decrypt(row.sender_phone)),
      sender_email: row.sender_email ? decrypt(row.sender_email) : null,
      is_masked: true,
      ...slaOf(row),
      images,
      history,
    };
    res.json(out);
  } catch (err) {
    console.error('Lỗi chi tiết ý kiến:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/submissions/:id/reveal — XEM DANH TÍNH ĐẦY ĐỦ
 * Mọi lần xem đều bị GHI NHẬT KÝ (ai xem, lúc nào) — chống lạm dụng.
 */
router.post('/:id/reveal', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT sender_name, sender_phone, sender_email, is_anonymous FROM submissions WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (rows[0].is_anonymous) {
      return res.status(400).json({ error: 'Ý kiến này được gửi ẨN DANH — không có danh tính để xem.' });
    }

    // GHI NHẬT KÝ trước khi trả dữ liệu
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details, ip_address) VALUES (?,?,?,?,?,?)',
      [req.staff.id, 'reveal_identity', 'submission', req.params.id,
       JSON.stringify({ at: new Date().toISOString() }),
       (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').slice(0, 45)]
    );

    res.json({
      sender_name: decrypt(rows[0].sender_name),
      sender_phone: decrypt(rows[0].sender_phone),
      sender_email: rows[0].sender_email ? decrypt(rows[0].sender_email) : null,
      warning: 'Lượt xem danh tính này đã được ghi vào nhật ký hệ thống.',
    });
  } catch (err) {
    console.error('Lỗi xem danh tính:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** PATCH /api/admin/submissions/:id/status — cập nhật trạng thái */
router.patch('/:id/status', async (req, res) => {
  const { status, note, rejectionReason } = req.body || {};
  const valid = ['received', 'processing', 'resolved', 'rejected'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
  if (status === 'rejected' && !rejectionReason?.trim()) {
    return res.status(400).json({ error: 'Vui lòng nhập lý do từ chối.' });
  }
  try {
    await pool.query('CALL update_submission_status(?,?,?,?,?)', [
      req.params.id, status, note || null, rejectionReason || null, req.staff.id,
    ]);
    res.json({ ok: true, message: 'Đã cập nhật trạng thái.' });
  } catch (err) {
    console.error('Lỗi cập nhật trạng thái:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật.' });
  }
});

/** PATCH /api/admin/submissions/:id/assign — phân công cán bộ (admin/manager) */
router.patch('/:id/assign', authorize('admin', 'manager'), async (req, res) => {
  const { staffId } = req.body || {};
  try {
    await pool.query('UPDATE submissions SET assigned_to = ? WHERE id = ?', [staffId || null, req.params.id]);
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details) VALUES (?,?,?,?,?)',
      [req.staff.id, 'assign', 'submission', req.params.id, JSON.stringify({ assignedTo: staffId })]
    );
    res.json({ ok: true, message: staffId ? 'Đã phân công cán bộ.' : 'Đã bỏ phân công.' });
  } catch (err) {
    console.error('Lỗi phân công:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/submissions/:id/review — DUYỆT hoặc ĐÁNH DẤU RÁC
 * Chỉ áp dụng cho ý kiến ẩn danh đang ở hàng chờ (pending_review).
 * body: { action: 'approve' | 'spam' }
 */
router.post('/:id/review', async (req, res) => {
  const { action } = req.body || {};
  if (!['approve', 'spam'].includes(action)) {
    return res.status(400).json({ error: 'Hành động không hợp lệ.' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT status, is_anonymous FROM submissions WHERE id = ?', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (rows[0].status !== 'pending_review') {
      return res.status(400).json({ error: 'Ý kiến này không nằm trong hàng chờ kiểm duyệt.' });
    }

    const newStatus = action === 'approve' ? 'received' : 'spam';

    await pool.query(
      `UPDATE submissions
       SET status = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [newStatus, req.staff.id, req.params.id]
    );

    // Ghi lịch sử + nhật ký
    await pool.query(
      'INSERT INTO status_history (submission_id, old_status, new_status, note, changed_by) VALUES (?,?,?,?,?)',
      [req.params.id, 'pending_review', newStatus,
       action === 'approve' ? 'Duyệt tin báo ẩn danh — đưa vào xử lý' : 'Đánh dấu tin rác',
       req.staff.id]
    );
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, ip_address) VALUES (?,?,?,?,?)',
      [req.staff.id, action === 'approve' ? 'review_approve' : 'review_spam',
       'submission', req.params.id,
       (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').slice(0, 45)]
    );

    res.json({
      ok: true,
      message: action === 'approve'
        ? 'Đã duyệt — ý kiến được đưa vào quy trình xử lý.'
        : 'Đã đánh dấu là tin rác.',
    });
  } catch (err) {
    console.error('Lỗi kiểm duyệt:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
