/**
 * Nhóm sự kiện trùng lặp — "nhiều người cùng báo 1 vụ việc".
 * Xem PHẦN GỘP SỰ KIỆN ở server/src/lib/duplicate.js để biết cách gộp.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/** GET /api/admin/incident-groups — danh sách nhóm có từ 2 ý kiến trở lên */
router.get('/', async (req, res) => {
  try {
    const chiChuaXem = req.query.chuaXem === '1';
    const [rows] = await pool.query(
      `SELECT g.id, g.submission_count, g.first_reported_at, g.last_reported_at,
              g.acknowledged, w.name AS ward_name, c.name AS category_name,
              s.tracking_code AS first_tracking_code,
              LEFT(s.original_content, 120) AS first_preview
       FROM incident_groups g
       LEFT JOIN wards w ON w.id = g.ward_id
       LEFT JOIN categories c ON c.id = g.category_id
       LEFT JOIN submissions s ON s.id = g.first_submission_id
       WHERE g.submission_count >= 2
         ${chiChuaXem ? 'AND g.acknowledged = FALSE' : ''}
       ORDER BY g.acknowledged ASC, g.last_reported_at DESC
       LIMIT 100`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('Lỗi tải nhóm sự kiện:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bạn đã chạy file nang_cap_v11.sql chưa?' });
  }
});

/** GET /api/admin/incident-groups/:id — chi tiết 1 nhóm, kèm toàn bộ ý kiến thành viên */
router.get('/:id', async (req, res) => {
  try {
    const [[group]] = await pool.query(
      `SELECT g.*, w.name AS ward_name, c.name AS category_name
       FROM incident_groups g
       LEFT JOIN wards w ON w.id = g.ward_id
       LEFT JOIN categories c ON c.id = g.category_id
       WHERE g.id = ?`,
      [req.params.id]
    );
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm sự kiện.' });

    const [members] = await pool.query(
      `SELECT id, tracking_code, status, is_anonymous, created_at, LEFT(original_content, 200) AS preview
       FROM submissions WHERE incident_group_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ group, members });
  } catch (err) {
    console.error('Lỗi tải chi tiết nhóm sự kiện:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** POST /api/admin/incident-groups/:id/ack — đánh dấu cán bộ đã xem nhóm này */
router.post('/:id/ack', async (req, res) => {
  try {
    await pool.query(
      'UPDATE incident_groups SET acknowledged = TRUE, acknowledged_by = ? WHERE id = ?',
      [req.staff.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
