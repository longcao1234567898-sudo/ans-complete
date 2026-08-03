/**
 * NHẬT KÝ HỆ THỐNG — ai làm gì, lúc nào, từ IP nào.
 * Đặc biệt quan trọng: theo dõi các lượt XEM DANH TÍNH người tố giác
 * để chống cán bộ lạm dụng quyền.
 *
 * Bảo vệ bởi requireAuth gắn ở routes/admin/index.js -> chỉ cán bộ đăng nhập gọi được.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();
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

/* GET /api/admin/logs/canh-bao — CẢNH BÁO TẤN CÔNG ĐĂNG NHẬP
   Liệt kê các địa chỉ IP có từ 5 lần đăng nhập thất bại trở lên trong 24 giờ.
   Ghi nhật ký mà không ai xem thì vô nghĩa — endpoint này để quản trị viên
   phát hiện sớm khi hệ thống đang bị dò mật khẩu. */
router.get('/canh-bao', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ip_address AS dia_chi_ip,
              COUNT(*) AS so_lan_that_bai,
              COUNT(DISTINCT attempted_username) AS so_tai_khoan_bi_thu,
              MIN(created_at) AS lan_dau,
              MAX(created_at) AS lan_cuoi
       FROM staff_activity_logs
       WHERE action = 'login_failed'
         AND created_at > NOW() - INTERVAL 24 HOUR
       GROUP BY ip_address
       HAVING COUNT(*) >= 5
       ORDER BY so_lan_that_bai DESC
       LIMIT 20`
    );

    /* Tài khoản đang bị khoá tạm — dấu hiệu tấn công đã chạm ngưỡng */
    let dangKhoa = [];
    try {
      const [r2] = await pool.query(
        `SELECT username, full_name, locked_until
         FROM staff WHERE locked_until IS NOT NULL AND locked_until > NOW()`
      );
      dangKhoa = r2;
    } catch { /* chưa nâng cấp v9 */ }

    res.json({
      ip_dang_ngo: rows,
      tai_khoan_dang_khoa: dangKhoa,
      co_canh_bao: rows.length > 0 || dangKhoa.length > 0,
    });
  } catch (err) {
    console.error('Lỗi lấy cảnh báo đăng nhập:', err.message);
    res.json({ ip_dang_ngo: [], tai_khoan_dang_khoa: [], co_canh_bao: false });
  }
});

export default router;
