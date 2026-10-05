/**
 * TRÍCH CHỮ TỆP ĐÍNH KÈM CỦA HỒ SƠ — /api/admin/submissions/:id/trich-chu (P52, ADR-005)
 * ============================================================================
 *
 *   GET  — chữ đã trích của từng tệp (và trạng thái tệp chưa trích)
 *   POST — xếp việc trích: { tepId?, lai?, ngonNgu? }
 *
 * Ai được: ai XEM ĐƯỢC hồ sơ (dieuKienXem — y như mở chi tiết). Ngoài phạm vi
 * trả 404, không 403 (BUG-009). Chữ trong tệp là bản sao nội dung tệp: cán bộ
 * không được mở tin tố giác mật thì cũng không được đọc chữ trong tệp của nó.
 *
 * Đọc chữ = mở hồ sơ: ghi nhật ký y như trang chi tiết — hồ sơ mang cờ ghi TRƯỚC,
 * ghi không được thì không trả (ADR-003 việc 9); hồ sơ thường gộp lượt mở 10 phút.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../../db.js';
import { authorize } from '../../middleware/authorize.js';
import { dieuKienXem, hoSoMangCo } from '../../lib/pham-vi-ho-so.js';
import { ghiNhatKy, ghiNhatKyTruoc } from '../../lib/helpers.js';
import { coBangTrichChu, xepViec, chayHangDoi, NGON_NGU_OCR } from '../../lib/hang-doi-trich-chu.js';
import { ocrDangBat } from '../../lib/trich-chu/index.js';

const router = Router();

/* Mỗi lượt có thể kéo theo vài phút OCR — chặn bấm liên tục. Theo cán bộ, không
   theo IP: cả trụ sở thường chung một IP. */
const gioiHanYeuCau = rateLimit({
  windowMs: 10 * 60_000,
  max: 30,
  keyGenerator: (req) => `trich-chu:${req.staff?.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Yêu cầu trích chữ quá nhiều, đợi vài phút rồi thử lại.' },
});

const maHopLe = (v) => /^[0-9]{1,15}$/.test(String(v ?? '')) && Number(v) > 0;

/** Hồ sơ `id` có trong phạm vi xem của `staff` không */
async function xemDuoc(staff, id) {
  const phamVi = await dieuKienXem(staff);
  const [r] = await pool.query(
    `SELECT s.id FROM submissions s WHERE s.id = ? AND ${phamVi.sql}`,
    [id, ...phamVi.params]
  );
  return r.length > 0;
}

const loaiTep = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'anh';
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('word')) return 'word';
  if (m.startsWith('video/')) return 'video';
  return 'khac';
};

router.get('/:id/trich-chu', authorize(), async (req, res) => {
  if (!maHopLe(req.params.id)) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  const id = Number(req.params.id);
  try {
    if (!(await xemDuoc(req.staff, id))) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });

    const luotMo = { loaiDoiTuong: 'submission', doiTuongId: id, gopPhut: 10 };
    if (await hoSoMangCo(id)) await ghiNhatKyTruoc(pool, req, { ...luotMo, hanhDong: 'view_flagged_submission' });
    else await ghiNhatKy(pool, req, { ...luotMo, hanhDong: 'view_submission' });

    const coBang = await coBangTrichChu();
    const [tep] = coBang
      ? await pool.query(
        `SELECT i.id AS tep_id, i.mime_type, t.trang_thai, t.phuong_phap, t.noi_dung, t.do_tin_cay,
                t.so_trang, t.ngon_ngu, t.ngon_ngu_dung, t.da_chuyen_tcvn3, t.ghi_chu, t.cap_nhat_luc
           FROM submission_images i LEFT JOIN trich_chu_tep t ON t.tep_id = i.id
          WHERE i.submission_id = ? ORDER BY i.id`,
        [id]
      )
      : await pool.query('SELECT i.id AS tep_id, i.mime_type FROM submission_images i WHERE i.submission_id = ? ORDER BY i.id', [id]);

    /* Còn việc chờ mà không ai chạy (máy chủ vừa khởi động lại) -> chạy tiếp */
    if (tep.some((t) => t.trang_thai === 'cho' || t.trang_thai === 'dang_lam')) chayHangDoi();

    res.json({
      coBang,
      ocrBat: ocrDangBat(),
      ngonNgu: NGON_NGU_OCR,
      tep: tep.map((t) => ({
        tepId: Number(t.tep_id),
        loai: loaiTep(t.mime_type),
        trangThai: t.trang_thai || 'chua',
        phuongPhap: t.phuong_phap ?? null,
        noiDung: t.trang_thai === 'xong' ? (t.noi_dung ?? '') : null,
        doTinCay: t.do_tin_cay == null ? null : Number(t.do_tin_cay),
        soTrang: t.so_trang == null ? null : Number(t.so_trang),
        ngonNgu: t.ngon_ngu_dung ?? null,
        ngonNguChon: t.ngon_ngu ?? null,
        daChuyenTcvn3: Boolean(Number(t.da_chuyen_tcvn3 || 0)),
        ghiChu: t.ghi_chu ?? null,
        capNhatLuc: t.cap_nhat_luc ?? null,
      })),
    });
  } catch (err) {
    console.error('Lỗi đọc chữ trích:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.post('/:id/trich-chu', authorize(), gioiHanYeuCau, async (req, res) => {
  if (!maHopLe(req.params.id)) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  const id = Number(req.params.id);
  const { tepId = null, lai = false, ngonNgu = null } = req.body ?? {};
  if (tepId !== null && !maHopLe(tepId)) return res.status(400).json({ error: 'Mã tệp không hợp lệ.' });
  if (typeof lai !== 'boolean') return res.status(400).json({ error: 'Giá trị "trích lại" không hợp lệ.' });
  if (ngonNgu !== null && !NGON_NGU_OCR.includes(ngonNgu)) {
    return res.status(400).json({ error: 'Ngôn ngữ OCR chỉ nhận: tiếng Việt, tiếng Anh, Việt + Anh.' });
  }
  try {
    if (!(await coBangTrichChu())) {
      return res.status(409).json({ error: 'Cần chạy tệp database/nang_cap_v33.sql trên cơ sở dữ liệu trước.' });
    }
    if (!(await xemDuoc(req.staff, id))) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    if (tepId !== null) {
      const [r] = await pool.query('SELECT id FROM submission_images WHERE id = ? AND submission_id = ?', [Number(tepId), id]);
      if (r.length === 0) return res.status(404).json({ error: 'Không tìm thấy tệp.' });
    }

    const soViec = await xepViec(id, {
      tepId: tepId === null ? null : Number(tepId), ngonNgu, lai, staffId: req.staff.id,
    });
    await ghiNhatKy(pool, req, {
      hanhDong: 'trich_chu_tep', loaiDoiTuong: 'submission', doiTuongId: id,
      chiTiet: { tepId: tepId === null ? 'tat_ca' : Number(tepId), lai, ngonNgu: ngonNgu ?? 'tu_chon', soViec },
    });
    if (soViec > 0) chayHangDoi();
    res.json({
      ok: true,
      soViec,
      message: soViec > 0
        ? `Đã xếp ${soViec} tệp vào hàng trích chữ. Ảnh và PDF scan mất vài giây đến vài phút mỗi tệp.`
        : 'Các tệp đã được trích chữ rồi. Muốn đọc lại thì bấm "Trích lại" ở từng tệp.',
    });
  } catch (err) {
    console.error('Lỗi xếp việc trích chữ:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
