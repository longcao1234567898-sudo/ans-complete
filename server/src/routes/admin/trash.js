/**
 * THÙNG RÁC — nơi chứa tin đã bị đánh dấu "Tin rác".
 *
 * VÌ SAO CẦN: cán bộ lỡ tay bấm nhầm là mất luôn tin báo của bà con.
 * Tin vào thùng rác được GIỮ 7 NGÀY, trong thời gian đó khôi phục lại được.
 * Quá 7 ngày hệ thống tự xoá vĩnh viễn (đỡ phình database).
 *
 * Route nằm sau requireAuth -> chỉ cán bộ đăng nhập mới gọi được.
 */
import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

const GIU_NGAY = 7; // số ngày giữ trong thùng rác trước khi xoá hẳn

/**
 * Tự dọn tin quá hạn giữ. Gọi mỗi lần cán bộ mở thùng rác —
 * đơn giản hơn dựng cron job, mà vẫn bảo đảm dữ liệu không tồn mãi.
 */
async function donRacQuaHan() {
  try {
    const [r] = await pool.query(
      `DELETE FROM submissions
       WHERE deleted_at IS NOT NULL
         AND deleted_at < NOW() - INTERVAL ? DAY`,
      [GIU_NGAY]
    );
    if (r.affectedRows > 0) {
      console.log(`🗑️  Đã tự xoá vĩnh viễn ${r.affectedRows} tin quá ${GIU_NGAY} ngày trong thùng rác`);
    }
    return r.affectedRows;
  } catch (err) {
    console.warn('Dọn thùng rác lỗi:', err.message);
    return 0;
  }
}

/** GET /api/admin/trash — danh sách tin trong thùng rác */
router.get('/', async (_req, res) => {
  try {
    const autoDeleted = await donRacQuaHan();

    const [rows] = await pool.query(
      `SELECT s.id, s.tracking_code, s.original_content, s.ai_processed_content,
              s.is_anonymous, s.created_at, s.deleted_at,
              st.full_name AS deleted_by_name,
              c.name AS category_name, c.code AS category_code,
              DATEDIFF(DATE_ADD(s.deleted_at, INTERVAL ? DAY), NOW()) AS days_left
       FROM submissions s
       LEFT JOIN staff st ON st.id = s.deleted_by
       LEFT JOIN categories c ON c.id = s.category_id
       WHERE s.deleted_at IS NOT NULL
       ORDER BY s.deleted_at DESC
       LIMIT 200`,
      [GIU_NGAY]
    );

    res.json({
      items: rows.map((r) => ({
        ...r,
        // Nội dung rút gọn, không cần hiện hết trong thùng rác
        preview: String(r.ai_processed_content || r.original_content || '').slice(0, 200),
        daysLeft: Math.max(0, Number(r.days_left) || 0),
      })),
      keepDays: GIU_NGAY,
      autoDeleted,
    });
  } catch (err) {
    console.error('Lỗi thùng rác:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bạn đã chạy nang_cap_v7.sql chưa?' });
  }
});

/** POST /api/admin/trash/:id/restore — khôi phục về hàng chờ kiểm duyệt */
router.post('/:id/restore', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, is_anonymous FROM submissions WHERE id = ? AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin trong thùng rác (có thể đã bị xoá hẳn).' });
    }

    // Tin ẩn danh -> trả về hàng chờ kiểm duyệt để xét lại
    // Tin thường  -> trả về trạng thái đã tiếp nhận
    const newStatus = rows[0].is_anonymous ? 'pending_review' : 'received';

    await pool.query(
      `UPDATE submissions
       SET deleted_at = NULL, deleted_by = NULL, status = ?
       WHERE id = ?`,
      [newStatus, req.params.id]
    );

    // Ghi nhật ký
    try {
      await pool.query(
        'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details, ip_address) VALUES (?,?,?,?,?,?)',
        [req.staff?.id ?? null, 'trash_restore', 'submission', req.params.id,
         'Khôi phục tin từ thùng rác', (req.ip || '').slice(0, 45)]
      );
    } catch { /* bỏ qua nếu chưa có bảng nhật ký */ }

    res.json({ ok: true, status: newStatus, message: 'Đã khôi phục tin báo.' });
  } catch (err) {
    console.error('Lỗi khôi phục:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi khôi phục.' });
  }
});

/** DELETE /api/admin/trash/:id — xoá vĩnh viễn NGAY (không chờ hết 7 ngày) */
router.delete('/:id', async (req, res) => {
  // Chỉ admin mới được xoá vĩnh viễn — tránh cán bộ thường xoá mất chứng cứ
  if (req.staff?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới được xoá vĩnh viễn.' });
  }

  try {
    const [r] = await pool.query(
      'DELETE FROM submissions WHERE id = ? AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tin trong thùng rác.' });
    }

    try {
      await pool.query(
        'INSERT INTO staff_activity_logs (staff_id, action, target_type, target_id, details, ip_address) VALUES (?,?,?,?,?,?)',
        [req.staff.id, 'trash_purge', 'submission', req.params.id,
         'Xoá vĩnh viễn tin trong thùng rác', (req.ip || '').slice(0, 45)]
      );
    } catch { /* bỏ qua */ }

    res.json({ ok: true, message: 'Đã xoá vĩnh viễn.' });
  } catch (err) {
    console.error('Lỗi xoá vĩnh viễn:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi xoá.' });
  }
});

/** DELETE /api/admin/trash — dọn sạch toàn bộ thùng rác (chỉ admin) */
router.delete('/', async (req, res) => {
  if (req.staff?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới được dọn sạch thùng rác.' });
  }
  try {
    const [r] = await pool.query('DELETE FROM submissions WHERE deleted_at IS NOT NULL');
    try {
      await pool.query(
        'INSERT INTO staff_activity_logs (staff_id, action, target_type, details, ip_address) VALUES (?,?,?,?,?)',
        [req.staff.id, 'trash_empty', 'submission',
         `Dọn sạch thùng rác (${r.affectedRows} tin)`, (req.ip || '').slice(0, 45)]
      );
    } catch { /* bỏ qua */ }
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    console.error('Lỗi dọn thùng rác:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
