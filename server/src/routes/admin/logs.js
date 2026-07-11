/**
 * NHẬT KÝ HỆ THỐNG — ai làm gì, lúc nào, từ IP nào.
 * Đặc biệt quan trọng: theo dõi các lượt XEM DANH TÍNH người tố giác
 * để chống cán bộ lạm dụng quyền.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();
router.use(requireAuth);
router.use(authorize('admin', 'manager')); // chỉ lãnh đạo được xem nhật ký

/** GET /api/admin/logs?action=&page=&limit= */
router.get('/', async (req, res) => {
  const { action } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 30));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (action) { where.push('l.action = ?'); params.push(action); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.details,
              l.ip_address, l.created_at,
              st.full_name AS staff_name, st.role AS staff_role,
              s.tracking_code
       FROM staff_activity_logs l
       LEFT JOIN staff st ON l.staff_id = st.id
       LEFT JOIN submissions s ON l.target_type = 'submission' AND l.target_id = s.id
       ${whereSql}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM staff_activity_logs l ${whereSql}`, params
    );

    // Đếm riêng số lượt xem danh tính (chỉ số cần theo dõi sát)
    const [[reveal]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM staff_activity_logs
       WHERE action = 'reveal_identity' AND created_at > NOW() - INTERVAL 30 DAY`
    );

    res.json({
      data: rows,
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      revealCount30d: reveal.cnt,
    });
  } catch (err) {
    console.error('Lỗi nhật ký:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
