/** API quản lý ý kiến cho cán bộ (yêu cầu đăng nhập) */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();
router.use(requireAuth); // mọi route dưới đây đều cần đăng nhập

/** GET /api/admin/submissions?status=&category=&page=&limit=&q= — danh sách + lọc + phân trang */
router.get('/', async (req, res) => {
  const { status, category, q } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (status) { where.push('s.status = ?'); params.push(status); }
  if (category) { where.push('c.code = ?'); params.push(category); }
  if (q) { where.push('(s.original_content LIKE ? OR s.tracking_code = ?)'); params.push(`%${q}%`, String(q).toUpperCase()); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              c.code AS category_code, c.name AS category_name,
              s.status, s.sender_name, s.is_flagged, s.created_at,
              st.full_name AS assigned_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       ${whereSql}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM submissions s LEFT JOIN categories c ON s.category_id = c.id ${whereSql}`,
      params
    );
    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Lỗi danh sách ý kiến:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** GET /api/admin/submissions/:id — chi tiết đầy đủ (kèm SĐT, ảnh, timeline) */
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, c.code AS category_code, c.name AS category_name,
              st.full_name AS assigned_name, rb.full_name AS resolved_by_name
       FROM submissions s
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN staff st ON s.assigned_to = st.id
       LEFT JOIN staff rb ON s.resolved_by = rb.id
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
    res.json({ ...rows[0], images, history });
  } catch (err) {
    console.error('Lỗi chi tiết ý kiến:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** PATCH /api/admin/submissions/:id/status — cập nhật trạng thái (dùng procedure có sẵn) */
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

/** PATCH /api/admin/submissions/:id/assign — phân công cán bộ (manager/admin) */
router.patch('/:id/assign', authorize('admin', 'manager'), async (req, res) => {
  const { staffId } = req.body || {};
  try {
    await pool.query('UPDATE submissions SET assigned_to = ? WHERE id = ?', [staffId || null, req.params.id]);
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details) VALUES (?,?,?,?,?)',
      [req.staff.id, 'assign', 'submission', req.params.id, JSON.stringify({ assignedTo: staffId })]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Lỗi phân công:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
