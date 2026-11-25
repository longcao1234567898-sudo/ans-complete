/**
 * GET /api/admin/staff — danh sách cán bộ (để phân công).
 * Bảo vệ bởi requireAuth gắn ở routes/admin/index.js -> chỉ cán bộ đăng nhập gọi được.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { dieuKienXem } from '../../lib/pham-vi-ho-so.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const phamVi = await dieuKienXem(req.staff, 's');
    const [rows] = await pool.query(
      `SELECT st.id, st.full_name, st.role, c.name AS category_name,
              (SELECT COUNT(*) FROM submissions s
                WHERE s.assigned_to = st.id
                  AND s.status IN ('received','processing')
                  AND s.deleted_at IS NULL
                  AND (s.is_spam IS NULL OR s.is_spam = 0)
                  AND ${phamVi.sql}) AS open_count
       FROM staff st
       LEFT JOIN categories c ON st.assigned_category_id = c.id
       WHERE st.is_active = TRUE
       ORDER BY st.full_name`,
      phamVi.params
    );
    res.json(rows);
  } catch (err) {
    console.error('Lỗi danh sách cán bộ:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
