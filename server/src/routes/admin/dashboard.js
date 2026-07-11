/** Thống kê tổng quan cho dashboard cán bộ */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { decrypt, maskName } from '../../lib/crypto.js';

const router = Router();
router.use(requireAuth);

/** GET /api/admin/dashboard/stats */
router.get('/stats', async (_req, res) => {
  try {
    const [[overview]] = await pool.query('SELECT * FROM vw_dashboard_stats');
    const [byCategory] = await pool.query('SELECT * FROM vw_category_stats');
    const [recent] = await pool.query(
      `SELECT s.tracking_code, s.status, s.sender_name, c.name AS category_name, s.created_at
       FROM submissions s LEFT JOIN categories c ON s.category_id = c.id
       ORDER BY s.created_at DESC LIMIT 8`
    );
    // SLA — cảnh báo quá hạn / sắp hết hạn / chưa phân công
    let sla = { overdue_count: 0, near_due_count: 0, unassigned_count: 0 };
    try {
      const [[row]] = await pool.query('SELECT * FROM vw_sla_stats');
      if (row) sla = row;
    } catch { /* chưa chạy nang_cap_v2.sql */ }

    // Che tên người gửi ở danh sách gần đây
    const recentSafe = recent.map((r) => ({ ...r, sender_name: maskName(decrypt(r.sender_name)) }));

    res.json({ overview, byCategory, recent: recentSafe, sla });
  } catch (err) {
    console.error('Lỗi thống kê:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
