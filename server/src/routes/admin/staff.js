/** GET /api/admin/staff — danh sách cán bộ (để phân công) */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.full_name, s.role, c.name AS category_name,
              (SELECT COUNT(*) FROM submissions sub
                WHERE sub.assigned_to = s.id AND sub.status IN ('received','processing')) AS open_count
       FROM staff s
       LEFT JOIN categories c ON s.assigned_category_id = c.id
       WHERE s.is_active = TRUE
       ORDER BY s.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi danh sách cán bộ:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
