/** Quản lý "Mã QR định vị" — điểm dán QR tại hiện trường, gắn với 1 phường/xã */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { generateTrackingCode } from '../../lib/helpers.js';
import { sanitizeText } from '../../lib/security.js';

const router = Router();
router.use(requireAuth);

/** GET /api/admin/qr-points — ai đã đăng nhập cũng xem/in được */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.code, p.name, p.note, p.is_active, p.created_at,
              p.ward_id, w.name AS ward_name
       FROM qr_points p JOIN wards w ON w.id = p.ward_id
       ORDER BY w.display_order, p.name`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('Lỗi tải danh sách điểm QR:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bạn đã chạy file nang_cap_v10.sql chưa?' });
  }
});

/** POST /api/admin/qr-points — tạo điểm mới (admin/manager) */
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  const name = sanitizeText(req.body?.name, 150);
  const note = sanitizeText(req.body?.note || '', 255);
  const wardId = Number(req.body?.wardId);
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên điểm.' });
  if (!wardId) return res.status(400).json({ error: 'Vui lòng chọn phường/xã.' });

  let code = generateTrackingCode(8);
  try {
    for (let i = 0; i < 5; i++) {
      const [exist] = await pool.query('SELECT 1 FROM qr_points WHERE code=?', [code]);
      if (exist.length === 0) break;
      code = generateTrackingCode(8);
    }
    const [result] = await pool.query(
      'INSERT INTO qr_points (code, name, ward_id, note, created_by) VALUES (?,?,?,?,?)',
      [code, name, wardId, note || null, req.staff.id]
    );
    res.status(201).json({ id: result.insertId, code, name, wardId, note });
  } catch (err) {
    console.error('Lỗi tạo điểm QR:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi tạo điểm QR.' });
  }
});

/** PATCH /api/admin/qr-points/:id — bật/tắt điểm (admin/manager) */
router.patch('/:id', authorize('admin', 'manager'), async (req, res) => {
  try {
    await pool.query('UPDATE qr_points SET is_active = ? WHERE id = ?', [
      req.body?.isActive === false ? 0 : 1,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** DELETE /api/admin/qr-points/:id — xoá hẳn (admin/manager) */
router.delete('/:id', authorize('admin', 'manager'), async (req, res) => {
  try {
    await pool.query('DELETE FROM qr_points WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
