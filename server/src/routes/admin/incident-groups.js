/**
 * Nhóm sự kiện trùng lặp — "nhiều người cùng báo 1 vụ việc".
 * Xem PHẦN GỘP SỰ KIỆN ở server/src/lib/duplicate.js để biết cách gộp.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { dieuKienNhomXem } from '../../lib/pham-vi-ho-so.js';
import { ghiNhatKy } from '../../lib/helpers.js';
import { DANG_CHO_SANG_LOC } from '../../lib/sang-loc.js';

const router = Router();
router.use(requireAuth);

/* Nhóm chứa hồ sơ người xem không được đọc thì ẩn cả nhóm, y như không tồn
   tại — số đơn, giờ, id đơn đầu đều là dấu vết (BUG-009, lib/pham-vi-ho-so.js) */

/** GET /api/admin/incident-groups — danh sách nhóm có từ 2 ý kiến trở lên */
router.get('/', async (req, res) => {
  try {
    const chiChuaXem = req.query.chuaXem === '1';
    const phamVi = await dieuKienNhomXem(req.staff);
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
         AND ${phamVi.sql}
         ${chiChuaXem ? 'AND g.acknowledged = FALSE' : ''}
       ORDER BY g.acknowledged ASC, g.last_reported_at DESC
       LIMIT 100`,
      phamVi.params
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
    const phamVi = await dieuKienNhomXem(req.staff);
    const [[group]] = await pool.query(
      `SELECT g.*, w.name AS ward_name, c.name AS category_name
       FROM incident_groups g
       LEFT JOIN wards w ON w.id = g.ward_id
       LEFT JOIN categories c ON c.id = g.category_id
       WHERE g.id = ? AND ${phamVi.sql}`,
      [req.params.id, ...phamVi.params]
    );
    if (!group) return res.status(404).json({ error: 'Không tìm thấy nhóm sự kiện.' });

    /* Nhóm đã qua điều kiện trên thì mọi thành viên đều xem được. Thành viên
       mới gộp vào một nhóm ĐÃ CÓ giữa hai câu này luôn là đơn vừa nhận, ở mức
       Thường (routes/submissions.js; mức chỉ lãnh đạo đặt sau). */
    /* Thành viên kèm thứ danh mục Tin trùng cần (ADR-003 việc 18): mức khẩn,
       người phụ trách, có đang chờ sàng lọc không (để vẽ ô đánh dấu hàng loạt).
       Gộp chỉ để hiển thị — người phụ trách, ghi chú của từng tin không đổi. */
    const [members] = await pool.query(
      `SELECT s.id, s.tracking_code, s.status, s.is_anonymous, s.created_at, s.urgency,
              LEFT(s.original_content, 200) AS preview, st.full_name AS assigned_name,
              (${DANG_CHO_SANG_LOC}) AS dang_cho
       FROM submissions s
       LEFT JOIN staff st ON st.id = s.assigned_to
       WHERE s.incident_group_id = ? ORDER BY s.created_at ASC`,
      [req.params.id]
    );
    res.json({
      group,
      members: members.map(({ dang_cho: dangCho, ...m }) => ({ ...m, dang_cho_sang_loc: Boolean(Number(dangCho)) })),
    });
  } catch (err) {
    console.error('Lỗi tải chi tiết nhóm sự kiện:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** POST /api/admin/incident-groups/:id/ack — đánh dấu cán bộ đã xem nhóm này */
router.post('/:id/ack', async (req, res) => {
  try {
    /* Nhóm bị ẩn thì không đánh dấu được: nếu được, cán bộ gạt nhóm chứa hồ
       sơ Mật khỏi mục "chưa xem" trên bảng điều hành của Trưởng (BUG-009).
       Phản hồi vẫn { ok: true } như nhóm không tồn tại — không lộ gì. */
    const phamVi = await dieuKienNhomXem(req.staff);
    const [kq] = await pool.query(
      `UPDATE incident_groups AS g SET acknowledged = TRUE, acknowledged_by = ?
        WHERE g.id = ? AND ${phamVi.sql}`,
      [req.staff.id, req.params.id, ...phamVi.params]
    );
    /* Chỉ ghi khi thật sự đánh dấu: nhóm ẩn hay không tồn tại vẫn trả { ok }
       như cũ, nhưng không để lại dòng "đã xem" cho một nhóm người này không thấy */
    if (kq.affectedRows) {
      await ghiNhatKy(pool, req, {
        hanhDong: 'ack_incident_group', loaiDoiTuong: 'incident_group', doiTuongId: Number(req.params.id),
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
