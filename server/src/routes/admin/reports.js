/** API báo cáo thống kê + dữ liệu bản đồ điểm nóng */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/** GET /api/admin/reports/summary?from=&to= — số liệu tổng hợp để xem + xuất Excel */
router.get('/summary', async (req, res) => {
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || '2999-12-31';
  const range = [from, to + ' 23:59:59'];

  try {
    // Tổng quan
    const [[overview]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(status='received')   AS received,
              SUM(status='processing') AS processing,
              SUM(status='resolved')   AS resolved,
              SUM(status='rejected')   AS rejected,
              SUM(status IN ('received','processing') AND deadline_at < NOW()) AS overdue
       FROM submissions WHERE created_at BETWEEN ? AND ?`, range
    );

    // Theo nhóm
    const [byCategory] = await pool.query(
      `SELECT c.name AS category, COUNT(s.id) AS total,
              SUM(s.status='resolved') AS resolved,
              SUM(s.status IN ('received','processing') AND s.deadline_at < NOW()) AS overdue,
              ROUND(AVG(CASE WHEN s.status='resolved'
                    THEN TIMESTAMPDIFF(HOUR, s.created_at, s.resolved_at) END), 1) AS avg_hours
       FROM categories c LEFT JOIN submissions s
         ON s.category_id = c.id AND s.created_at BETWEEN ? AND ?
       GROUP BY c.id, c.name ORDER BY c.display_order`, range
    );

    // Theo ngày (biểu đồ đường)
    const [byDay] = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM submissions WHERE created_at BETWEEN ? AND ?
       GROUP BY DATE(created_at) ORDER BY day`, range
    );

    // Theo địa bàn
    const [byWard] = await pool.query(
      `SELECT w.name AS ward, COUNT(s.id) AS total
       FROM wards w LEFT JOIN submissions s
         ON s.ward_id = w.id AND s.created_at BETWEEN ? AND ?
       GROUP BY w.id, w.name ORDER BY total DESC`, range
    );

    // Hiệu suất cán bộ
    const [byStaff] = await pool.query(
      `SELECT st.full_name AS staff, COUNT(s.id) AS assigned,
              SUM(s.status='resolved') AS resolved
       FROM staff st LEFT JOIN submissions s
         ON s.assigned_to = st.id AND s.created_at BETWEEN ? AND ?
       WHERE st.is_active = TRUE
       GROUP BY st.id, st.full_name ORDER BY assigned DESC`, range
    );

    res.json({ from, to, overview, byCategory, byDay, byWard, byStaff });
  } catch (err) {
    console.error('Lỗi báo cáo:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bạn đã chạy file nang_cap_v2.sql chưa?' });
  }
});

/** GET /api/admin/reports/map — dữ liệu bản đồ điểm nóng */
router.get('/map', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.name, w.lat, w.lng,
              COUNT(s.id) AS total,
              SUM(s.status IN ('received','processing')) AS pending,
              SUM(s.status IN ('received','processing') AND s.deadline_at < NOW()) AS overdue,
              SUM(c.code = 'to_giac') AS to_giac
       FROM wards w
       LEFT JOIN submissions s ON s.ward_id = w.id
       LEFT JOIN categories c ON c.id = s.category_id
       GROUP BY w.id, w.name, w.lat, w.lng
       ORDER BY total DESC`
    );
    res.json(rows.map((r) => ({
      ...r,
      lat: Number(r.lat),
      lng: Number(r.lng),
      total: Number(r.total),
      pending: Number(r.pending || 0),
      overdue: Number(r.overdue || 0),
      to_giac: Number(r.to_giac || 0),
    })));
  } catch (err) {
    console.error('Lỗi bản đồ:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bạn đã chạy file nang_cap_v2.sql chưa?' });
  }
});

export default router;
