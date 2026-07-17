/** API báo cáo thống kê + dữ liệu bản đồ điểm nóng */
import { Router } from 'express';
import { pool } from '../../db.js';
import { decrypt, maskName } from '../../lib/crypto.js';
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

/**
 * GET /api/admin/reports/details?from=&to=
 * DANH SÁCH Ý KIẾN CHI TIẾT trong khoảng thời gian — cho sheet Excel nộp lãnh đạo.
 * Danh tính CHE SẴN (không xuất tên/SĐT đầy đủ ra file).
 */
router.get('/details', async (req, res) => {
  try {
    const from = req.query.from || '2000-01-01';
    const to = req.query.to || '2100-01-01';

    const [rows] = await pool.query(
      `SELECT s.tracking_code, s.status, s.is_anonymous, s.created_at, s.deadline_at,
              s.ai_processed_content, s.original_content, s.sender_name,
              c.name AS category_name, w.name AS ward_name, st.full_name AS staff_name
       FROM submissions s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN wards w      ON w.id = s.ward_id
       LEFT JOIN staff st     ON st.id = s.assigned_to
       WHERE s.created_at BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
         AND s.status NOT IN ('spam')
       ORDER BY s.created_at DESC
       LIMIT 2000`,
      [from, to]
    );

    const STATUS_VN = {
      pending_review: 'Chờ kiểm duyệt',
      received: 'Đã tiếp nhận',
      processing: 'Đang xử lý',
      resolved: 'Đã giải quyết',
      rejected: 'Từ chối',
    };

    res.json(
      rows.map((r) => ({
        trackingCode: r.tracking_code,
        content: String(r.ai_processed_content || r.original_content || '').slice(0, 300),
        category: r.category_name || '',
        ward: r.ward_name || '',
        status: STATUS_VN[r.status] || r.status,
        sender: r.is_anonymous ? 'Ẩn danh' : maskName(decrypt(r.sender_name)),
        staff: r.staff_name || '(chưa phân công)',
        createdAt: r.created_at,
        deadlineAt: r.deadline_at,
        overdue: r.deadline_at && ['received', 'processing'].includes(r.status)
          ? new Date(r.deadline_at) < new Date() : false,
      }))
    );
  } catch (err) {
    console.error('Lỗi báo cáo chi tiết:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi tải danh sách chi tiết.' });
  }
});

export default router;
