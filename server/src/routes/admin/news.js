/**
 * QUẢN LÝ TIN TỨC — cho cán bộ tự đăng, sửa, xoá tin ngay trên web.
 * ============================================================================
 *
 * VÌ SAO CẦN: trước đây muốn đăng tin phải viết câu lệnh SQL rồi chạy trong
 * HeidiSQL. Cán bộ thường không làm được, nên mục tin tức đứng im — mà tin cảnh
 * giác lừa đảo lại là thứ cần cập nhật liên tục nhất.
 *
 * ⚠️ PHÂN QUYỀN: mọi vai trò cán bộ ĐỌC được danh sách (để biết đơn vị đã đăng
 *    gì), nhưng chỉ chỉ huy và quản trị mới VIẾT, SỬA, XOÁ. Tin tức đứng tên
 *    đơn vị công an nên nội dung phải qua người có trách nhiệm.
 *
 * ⚠️ XOÁ LÀ ẨN, KHÔNG XOÁ HẲN: đặt is_published = 0 thay vì DELETE. Tin đã đăng
 *    có thể đã được bà con chia sẻ đi nơi khác; xoá hẳn khỏi database thì không
 *    còn cách nào tra lại đơn vị đã từng đăng gì. Muốn xoá hẳn thì làm trong
 *    database, có chủ đích.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { authorize } from '../../middleware/authorize.js';
import { ghiNhatKy } from '../../lib/helpers.js';
import { sanitizeText } from '../../lib/security.js';

const router = Router();

/** Bốn nhóm tin, khớp với ENUM trong database. */
const NHOM_HOP_LE = ['security', 'warning', 'guide', 'document'];

/** Đọc và làm sạch dữ liệu tin từ yêu cầu gửi lên. */
function docDuLieuTin(body) {
  const title = sanitizeText(String(body?.title || '')).trim().slice(0, 255);
  const summary = sanitizeText(String(body?.summary || '')).trim().slice(0, 1000);
  const content = sanitizeText(String(body?.content || '')).trim().slice(0, 20000);
  const category = NHOM_HOP_LE.includes(body?.category) ? body.category : 'security';
  const image_url = String(body?.image_url || '').trim().slice(0, 500) || null;
  const source_name = sanitizeText(String(body?.source_name || '')).trim().slice(0, 100) || null;
  const source_url = String(body?.source_url || '').trim().slice(0, 500) || null;
  const is_featured = body?.is_featured ? 1 : 0;
  const published_at = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.published_at || ''))
    ? body.published_at : null;

  /* Đường dẫn ngoài phải là http hoặc https. Không kiểm thì có thể nhét
     javascript: vào, bấm vào là chạy mã trong phiên của người đọc. */
  const linkAnToan = (u) => !u || /^https?:\/\//i.test(u);
  if (!linkAnToan(source_url) || !linkAnToan(image_url)) {
    return { loi: 'Đường dẫn phải bắt đầu bằng http hoặc https.' };
  }
  if (title.length < 10) return { loi: 'Tiêu đề quá ngắn (ít nhất 10 ký tự).' };
  if (summary.length < 20) return { loi: 'Tóm tắt quá ngắn (ít nhất 20 ký tự).' };

  return { title, summary, content, category, image_url, source_name, source_url,
           is_featured, published_at };
}

/** Cột is_featured chỉ có sau nang_cap_v13.sql. Kiểm một lần rồi nhớ. */
let _coNoiBat = null;
async function coCotNoiBat() {
  if (_coNoiBat !== null) return _coNoiBat;
  try {
    const [r] = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'news'
          AND column_name = 'is_featured' LIMIT 1`
    );
    _coNoiBat = r.length > 0;
  } catch { _coNoiBat = false; }
  return _coNoiBat;
}

/** GET / — danh sách tin, MỌI vai trò cán bộ xem được */
router.get('/', async (req, res) => {
  const anDaAn = String(req.query.hienCaAn || '') !== '1';
  try {
    const coNB = await coCotNoiBat();
    const [rows] = await pool.query(
      `SELECT id, title, summary, category, image_url, source_name, source_url,
              is_published, published_at, created_at
              ${coNB ? ', is_featured' : ', 0 AS is_featured'}
         FROM news
        WHERE (? = 0 OR is_published = 1)
        ORDER BY published_at DESC, id DESC
        LIMIT 300`,
      [anDaAn ? 1 : 0]
    );
    res.json(rows);
  } catch (err) {
    console.error('Đọc tin lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được danh sách tin.' });
  }
});

/** GET /:id — một tin đầy đủ để sửa */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  try {
    const coNB = await coCotNoiBat();
    const [[tin]] = await pool.query(
      `SELECT id, title, summary, content, category, image_url, source_name,
              source_url, is_published, published_at
              ${coNB ? ', is_featured' : ', 0 AS is_featured'}
         FROM news WHERE id = ?`, [id]
    );
    if (!tin) return res.status(404).json({ error: 'Không tìm thấy tin.' });
    res.json(tin);
  } catch (err) {
    res.status(500).json({ error: 'Không tải được tin.' });
  }
});

/** POST / — đăng tin mới. Chỉ chỉ huy và quản trị. */
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  const d = docDuLieuTin(req.body);
  if (d.loi) return res.status(400).json({ error: d.loi });
  try {
    const coNB = await coCotNoiBat();
    const [kq] = await pool.query(
      `INSERT INTO news (title, summary, content, category, image_url, source_name,
                         source_url, is_external, is_published, published_at
                         ${coNB ? ', is_featured' : ''})
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?, CURDATE())${coNB ? ',?' : ''})`,
      coNB
        ? [d.title, d.summary, d.content, d.category, d.image_url, d.source_name,
           d.source_url, Boolean(d.source_url), 1, d.published_at, d.is_featured]
        : [d.title, d.summary, d.content, d.category, d.image_url, d.source_name,
           d.source_url, Boolean(d.source_url), 1, d.published_at]
    );
    await ghiNhatKy(pool, req, {
      hanhDong: 'news_create', loaiDoiTuong: 'news', doiTuongId: kq.insertId,
      chiTiet: { title: d.title, category: d.category },
    });
    res.status(201).json({ ok: true, id: kq.insertId, message: 'Đã đăng tin.' });
  } catch (err) {
    console.error('Đăng tin lỗi:', err.message);
    res.status(500).json({ error: 'Không đăng được tin.' });
  }
});

/** PUT /:id — sửa tin. Chỉ chỉ huy và quản trị. */
router.put('/:id', authorize('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  const d = docDuLieuTin(req.body);
  if (d.loi) return res.status(400).json({ error: d.loi });
  try {
    const coNB = await coCotNoiBat();
    const [kq] = await pool.query(
      `UPDATE news SET title=?, summary=?, content=?, category=?, image_url=?,
              source_name=?, source_url=?, published_at=COALESCE(?, published_at)
              ${coNB ? ', is_featured=?' : ''}
        WHERE id = ?`,
      coNB
        ? [d.title, d.summary, d.content, d.category, d.image_url, d.source_name,
           d.source_url, d.published_at, d.is_featured, id]
        : [d.title, d.summary, d.content, d.category, d.image_url, d.source_name,
           d.source_url, d.published_at, id]
    );
    if (kq.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy tin.' });
    await ghiNhatKy(pool, req, {
      hanhDong: 'news_update', loaiDoiTuong: 'news', doiTuongId: id,
      chiTiet: { title: d.title },
    });
    res.json({ ok: true, message: 'Đã lưu thay đổi.' });
  } catch (err) {
    console.error('Sửa tin lỗi:', err.message);
    res.status(500).json({ error: 'Không lưu được.' });
  }
});

/** PATCH /:id/hien — bật tắt hiển thị. Chỉ chỉ huy và quản trị.
 *
 *  Đây là cách "xoá" tin: ẩn khỏi trang người dân nhưng giữ trong database.
 *  Xem chú thích đầu tệp về lý do không xoá hẳn. */
router.patch('/:id/hien', authorize('admin', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  const hien = req.body?.hien === true;
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  try {
    const [kq] = await pool.query('UPDATE news SET is_published = ? WHERE id = ?', [hien ? 1 : 0, id]);
    if (kq.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy tin.' });
    await ghiNhatKy(pool, req, {
      hanhDong: hien ? 'news_show' : 'news_hide', loaiDoiTuong: 'news', doiTuongId: id,
    });
    res.json({ ok: true, message: hien ? 'Đã hiện tin.' : 'Đã ẩn tin khỏi trang người dân.' });
  } catch (err) {
    res.status(500).json({ error: 'Không đổi được trạng thái.' });
  }
});

export default router;
