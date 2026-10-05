/**
 * TỆP ĐÍNH KÈM CỦA HỒ SƠ ĐÃ XOÁ DANH TÍNH — chỉ lãnh đạo (BUG-029)
 * ============================================================================
 *
 *   POST   /api/admin/submissions/:id/tep-sau-xoa-danh-tinh — mở các tệp đang bị che
 *   DELETE /api/admin/submissions/:id/tep/:tepId             — xoá hẳn một tệp { lyDo }
 *
 * Trang chi tiết che sẵn tệp của hồ sơ đã xoá danh tính với mọi người (như che
 * danh tính); mở ra phải bấm riêng — y như /reveal. Hai lớp, đúng thứ tự:
 *   1. authorize(...LANH_DAO): cán bộ không bao giờ chạm tới được
 *   2. ghi nhật ký TRƯỚC, ghi không được thì không trả / không xoá
 * Ngoài phạm vi xem trả 404 (BUG-009). Hồ sơ chưa xoá danh tính trả 409: tệp của
 * hồ sơ thường xem ở trang chi tiết, và chứng cứ của hồ sơ thường không xoá
 * được qua đường này — đây không phải lối tắt xoá chứng cứ.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { authorize } from '../../middleware/authorize.js';
import { LANH_DAO } from '../../lib/vai-tro.js';
import { dieuKienXem } from '../../lib/pham-vi-ho-so.js';
import { ghiNhatKyTruoc } from '../../lib/helpers.js';
import { coBangTrichChu } from '../../lib/hang-doi-trich-chu.js';
import { keHoachXoaKho, thucHienXoaKho, anhConNoiKhacDung, LoiKhoAnh } from '../../lib/tep-sau-xoa-danh-tinh.js';

const router = Router();
const maHopLe = (v) => /^[0-9]{1,15}$/.test(String(v ?? '')) && Number(v) > 0;

/** Hồ sơ trong phạm vi xem: { xoa } — ngoài phạm vi / không có: null */
async function hoSoTrongPhamVi(staff, id) {
  const phamVi = await dieuKienXem(staff);
  const [r] = await pool.query(
    `SELECT COALESCE(s.identity_erased, 0) AS xoa FROM submissions s WHERE s.id = ? AND ${phamVi.sql}`,
    [id, ...phamVi.params]
  );
  return r.length === 0 ? null : { xoa: Number(r[0].xoa) === 1 };
}

const CHUA_XOA = 'Hồ sơ này chưa xoá danh tính — tệp đính kèm xem ở trang chi tiết như thường.';

router.post('/:id/tep-sau-xoa-danh-tinh', authorize(...LANH_DAO), async (req, res) => {
  if (!maHopLe(req.params.id)) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  const id = Number(req.params.id);
  try {
    const hs = await hoSoTrongPhamVi(req.staff, id);
    if (!hs) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (!hs.xoa) return res.status(409).json({ error: CHUA_XOA });

    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'view_erased_attachments', loaiDoiTuong: 'submission', doiTuongId: id,
    });
    const [tep] = await pool.query(
      `SELECT id, image_url, mime_type, moderation_status, bo_sung_id
         FROM submission_images WHERE submission_id = ? ORDER BY id`,
      [id]
    );
    res.json({
      tep: tep.map((t) => ({
        tepId: Number(t.id),
        image_url: t.image_url,
        mime_type: t.mime_type,
        moderation_status: t.moderation_status,
        boSungId: t.bo_sung_id == null ? null : Number(t.bo_sung_id),
      })),
    });
  } catch (err) {
    console.error('Lỗi mở tệp hồ sơ đã xoá danh tính:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ — chưa mở được tệp.' });
  }
});

router.delete('/:id/tep/:tepId', authorize(...LANH_DAO), async (req, res) => {
  if (!maHopLe(req.params.id) || !maHopLe(req.params.tepId)) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  const id = Number(req.params.id);
  const tepId = Number(req.params.tepId);
  const lyDo = typeof req.body?.lyDo === 'string' ? req.body.lyDo.trim() : '';
  if (lyDo.length < 5 || lyDo.length > 500) {
    return res.status(400).json({ error: 'Ghi lý do xoá (5–500 ký tự) — xoá hẳn là không lấy lại được.' });
  }
  try {
    const hs = await hoSoTrongPhamVi(req.staff, id);
    if (!hs) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (!hs.xoa) {
      return res.status(409).json({ error: 'Chỉ xoá được tệp của hồ sơ đã xoá danh tính theo yêu cầu người dân.' });
    }
    const [[tep]] = await pool.query(
      'SELECT id, image_url, cloudinary_id, storage, mime_type FROM submission_images WHERE id = ? AND submission_id = ?',
      [tepId, id]
    );
    if (!tep) return res.status(404).json({ error: 'Không tìm thấy tệp.' });

    /* Thứ tự: kiểm cấu hình kho (không gọi mạng) -> ghi nhật ký -> xoá trên kho ->
       xoá trong CSDL. Xoá trên kho trước CSDL: kho lỗi thì dòng CSDL còn nguyên để
       làm lại, không có ảnh mồ côi trên Internet mà hệ thống đã quên. */
    const keHoach = keHoachXoaKho(tep);
    /* Một ảnh trên kho có thể được nhiều dòng trỏ tới (cùng đường dẫn, khác số phiên bản,
       khác đuôi) — kể cả do kẻ xấu cố ý khai trùng ảnh chứng cứ hồ sơ khác. Xoá trên kho là
       mất ở mọi nơi: còn chỗ khác dùng thì không xoá, lãnh đạo không thành tay sai xoá chứng cứ. */
    if (keHoach && await anhConNoiKhacDung(tepId, keHoach.maAnh)) {
      return res.status(409).json({
        error: 'Ảnh này còn hồ sơ khác hoặc tin tức đang dùng — xoá trên kho là mất ở cả nơi đó. Máy không xoá; '
          + 'báo quản trị kiểm tra.',
      });
    }
    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'delete_erased_attachment', loaiDoiTuong: 'submission', doiTuongId: id,
      chiTiet: {
        tepId, loai: tep.mime_type, luuTru: tep.storage, lyDo,
        /* Ảnh trên kho: ghi mã ảnh + đường dẫn để tra được đã xoá đúng tài nguyên nào.
           Tệp lưu trong CSDL thì KHÔNG ghi nội dung (chính là tệp chứa danh tính) */
        ...(keHoach ? { maAnh: keHoach.maAnh, duongDan: tep.image_url } : {}),
      },
    });
    const khoAnh = keHoach ? await thucHienXoaKho(keHoach) : 'khong_co';
    /* Chữ trích đi theo tệp — MySQL tự xoá theo khoá ngoại; xoá tường minh để không
       phụ thuộc khoá ngoại có mặt hay không */
    if (await coBangTrichChu()) await pool.query('DELETE FROM trich_chu_tep WHERE tep_id = ?', [tepId]);
    await pool.query('DELETE FROM submission_images WHERE id = ? AND submission_id = ?', [tepId, id]);
    res.json({
      ok: true,
      khoAnh,
      message: khoAnh === 'da_xoa' ? 'Đã xoá hẳn tệp, cả bản trên kho ảnh.' : 'Đã xoá hẳn tệp.',
    });
  } catch (err) {
    if (err instanceof LoiKhoAnh) return res.status(err.status).json({ error: err.message });
    console.error('Lỗi xoá tệp hồ sơ đã xoá danh tính:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ — chưa xoá tệp.' });
  }
});

export default router;
