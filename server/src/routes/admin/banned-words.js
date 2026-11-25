/** Quản lý bộ từ cấm (admin/manager) */
import { Router } from 'express';
import { pool } from '../../db.js';
import { requireAuth } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { LANH_DAO } from '../../lib/vai-tro.js';
import { ghiNhatKy } from '../../lib/helpers.js';
import { loadBannedWords } from '../../lib/security.js';

const router = Router();
router.use(requireAuth, authorize(...LANH_DAO));

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, word, word_type, is_active, created_at FROM banned_words ORDER BY created_at DESC');
    res.json({ data: rows });
  } catch (err) {
    console.error('Lỗi tải danh sách từ cấm:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi tải từ cấm.' });
  }
});

router.post('/', async (req, res) => {
  const { word, wordType } = req.body || {};
  if (!word?.trim()) return res.status(400).json({ error: 'Vui lòng nhập từ.' });
  try {
    const tu = word.trim().toLowerCase();
    const [kq] = await pool.query(
      'INSERT INTO banned_words (word, word_type, added_by) VALUES (?,?,?)',
      [tu, wordType === 'token' ? 'token' : 'phrase', req.staff.id]
    );
    await loadBannedWords(pool).catch(() => {});
    /* Từ cấm quyết định tin nào bị chặn ngay từ cửa — đổi nó là đổi cái lưới lọc
       tin báo của người dân, phải biết ai đổi */
    await ghiNhatKy(pool, req, {
      hanhDong: 'banned_word_add', loaiDoiTuong: 'banned_word', doiTuongId: kq.insertId ?? null, chiTiet: { tu },
    });
    res.status(201).json({ ok: true, message: 'Đã thêm từ cấm và áp dụng ngay.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Từ này đã có trong danh sách.' });
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mã từ cấm không hợp lệ.' });
  }
  try {
    const [cu] = await pool.query('SELECT word FROM banned_words WHERE id = ?', [id]);
    const [kq] = await pool.query('DELETE FROM banned_words WHERE id = ?', [id]);
    if (kq.affectedRows) {
      await loadBannedWords(pool).catch(() => {});
      await ghiNhatKy(pool, req, {
        hanhDong: 'banned_word_delete', loaiDoiTuong: 'banned_word', doiTuongId: id,
        chiTiet: { tu: cu[0]?.word ?? null },
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Lỗi xoá từ cấm:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi xoá từ cấm.' });
  }
});

export default router;
