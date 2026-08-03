/**
 * Thống kê tổng quan cho dashboard cán bộ.
 * Bảo vệ bởi requireAuth gắn ở routes/admin/index.js -> chỉ cán bộ đăng nhập gọi được.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { decrypt, maskName } from '../../lib/crypto.js';

const router = Router();

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
    /* DANH SÁCH VIỆC QUÁ HẠN / SẮP HẠN — hiện thẳng trên dashboard.
       Trước đây chỉ đếm số rồi bắt cán bộ bấm sang trang khác mới xem được.
       Giờ mở dashboard là thấy ngay việc nào cần làm gấp.
       Sắp xếp: khẩn cấp trước, rồi tới quá hạn lâu nhất. */
    let canGap = [];
    try {
      const [rows] = await pool.query(
        `SELECT s.id, s.tracking_code, s.original_content, s.urgency, s.status,
                s.deadline_at, c.name AS category_name,
                st.full_name AS assigned_name,
                DATEDIFF(NOW(), s.deadline_at) AS so_ngay_qua_han
         FROM submissions s
         LEFT JOIN categories c ON c.id = s.category_id
         LEFT JOIN staff st ON st.id = s.assigned_to
         WHERE s.status IN ('received','processing')
           AND s.deleted_at IS NULL
           AND s.deadline_at IS NOT NULL
           AND s.deadline_at < NOW() + INTERVAL 3 DAY
         ORDER BY FIELD(s.urgency,'urgent','important','normal'), s.deadline_at ASC
         LIMIT 10`
      );
      canGap = rows.map((r) => ({
        ...r,
        // Rút gọn nội dung, cán bộ chỉ cần nhìn lướt là biết việc gì
        preview: String(r.original_content || '').slice(0, 90),
        quaHan: Number(r.so_ngay_qua_han) > 0,
        soNgay: Math.abs(Number(r.so_ngay_qua_han) || 0),
      }));
    } catch (e) {
      console.warn('Bỏ qua danh sách việc cần gấp:', e.message);
    }

    // SLA — cảnh báo quá hạn / sắp hết hạn / chưa phân công
    let sla = { overdue_count: 0, near_due_count: 0, unassigned_count: 0, pending_review_count: 0 };
    try {
      const [[row]] = await pool.query('SELECT * FROM vw_sla_stats');
      if (row) sla = row;
    } catch { /* chưa chạy nang_cap_v2.sql */ }

    // Che tên người gửi ở danh sách gần đây
    const recentSafe = recent.map((r) => ({ ...r, sender_name: maskName(decrypt(r.sender_name)) }));

    res.json({ overview, byCategory, recent: recentSafe, sla, canGap });
  } catch (err) {
    console.error('Lỗi thống kê:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
