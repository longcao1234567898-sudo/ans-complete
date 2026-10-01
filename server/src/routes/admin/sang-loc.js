/**
 * SÀNG LỌC, NGOÀI THẨM QUYỀN, GHI CHÚ NỘI BỘ (ADR-003 việc 13–16)
 *
 * Gắn dưới /api/admin/submissions (routes/admin/index.js), cạnh router hồ sơ.
 * Đường đi của tin và các phần: xem lib/sang-loc.js.
 *
 * Mọi nút kiểm ở MÁY CHỦ, theo thứ tự: đúng kiểu dữ liệu -> đúng vai trò ->
 * hồ sơ trong phạm vi người bấm xem được (404 nếu không, như không tồn tại) ->
 * hồ sơ đang ở đúng chỗ nút đó dùng được (409 nếu không). Giao diện ẩn nút chỉ
 * để dễ dùng, không phải lớp bảo vệ.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { authorize } from '../../middleware/authorize.js';
import { LANH_DAO, laLanhDao } from '../../lib/vai-tro.js';
import { ghiNhatKy, ghiNhatKyTruoc } from '../../lib/helpers.js';
import { dieuKienXem, dieuKienNhomXem, coCotCo } from '../../lib/pham-vi-ho-so.js';
import { doTuongDong } from '../../lib/duplicate.js';
import { decrypt, maskName } from '../../lib/crypto.js';
import {
  DANG_CHO_SANG_LOC, coCotSangLoc, themGhiChu, LOI_THIEU_COT, timPhan,
} from '../../lib/sang-loc.js';

const router = Router();

const DO_DAI_GHI_CHU = 2000;
/* Lý do "Tin giả" là bắt buộc và phải đủ để người sau hiểu — "abc" không phải lý do */
const LY_DO_TOI_THIEU = 5;
/* Lời trả người dân khi tin bị đánh "Tin giả". Lý do của cán bộ là NỘI BỘ (ghi
   chú) — "nghi bịa đặt", "gọi lại không có thật" không đưa ra tra cứu công khai. */
const LOI_TU_CHOI_CONG_KHAI = 'Thông tin chưa xác minh được. Nếu có thêm căn cứ, bà con vui lòng gửi lại kèm chi tiết, việc khẩn cấp gọi ngay 113.';

const soId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const chuoi = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * POST /api/admin/submissions/:id/sang-loc  { hanhDong, ghiChu }
 * hanhDong: xac_nhan | chua_xac_minh | tin_gia | ngoai_tham_quyen
 * Mọi cán bộ và lãnh đạo dùng được.
 */
const HANH_DONG_SANG_LOC = ['xac_nhan', 'chua_xac_minh', 'tin_gia', 'ngoai_tham_quyen'];

/**
 * Một thao tác sàng lọc trên MỘT tin — dùng chung cho nút đơn và nút hàng loạt,
 * để hai đường không bao giờ lệch luật nhau. Trả { status, body }; không ném lỗi
 * nghiệp vụ (lỗi CSDL thì ném, nơi gọi bắt).
 */
async function sangLocMotTin(req, id, hanhDong, ghiChu) {
  const phamVi = await dieuKienXem(req.staff);
  const [thay] = await pool.query(
    `SELECT s.id, s.assigned_to, st.role AS vai_tro_phu_trach, c.code AS nhom,
            (${DANG_CHO_SANG_LOC}) AS dang_cho
       FROM submissions s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN staff st ON st.id = s.assigned_to
      WHERE s.id = ? AND ${phamVi.sql}`,
    [id, ...phamVi.params]
  );
  if (thay.length === 0) return { status: 404, body: { error: 'Không tìm thấy ý kiến.' } };
  if (!Number(thay[0].dang_cho)) {
    return { status: 409, body: { error: 'Tin này không nằm trong hàng sàng lọc.' } };
  }
  const hs = thay[0];

  if (hanhDong === 'xac_nhan') {
    /* Thủ tục tự ghi lịch sử và dòng nhật ký update_status */
    await pool.query('CALL update_submission_status(?,?,?,?,?)',
      [id, 'processing', ghiChu || 'Sàng lọc: xác nhận tin, đưa vào xử lý', null, req.staff.id]);
    await pool.query(
      `UPDATE submissions SET sang_loc_boi = ?, sang_loc_luc = NOW(), chua_xac_minh_luc = NULL WHERE id = ?`,
      [req.staff.id, id]
    );
  } else if (hanhDong === 'chua_xac_minh') {
    /* Ở lại hàng sàng lọc, gắn nhãn. Chờ người dân bổ sung (việc 21); hết hạn
       thì cán bộ quyết với thông tin đang có. */
    await pool.query('UPDATE submissions SET chua_xac_minh_luc = NOW() WHERE id = ?', [id]);
    if (ghiChu) await themGhiChu(id, req.staff.id, `[Chưa xác minh] ${ghiChu}`);
  } else if (hanhDong === 'tin_gia') {
    /* Vào thùng rác, KHÔNG khoá máy (ADR-003 §7.3): người gửi có thể nhầm chứ
       không phá. Muốn khoá thì bấm nút "Tin rác" — có ở cả hàng sàng lọc lẫn
       bảng xử lý, đi đường /mark-spam; không thêm thao tác khoá ở đây để luật
       khoá chỉ sống một chỗ. Lý do của cán bộ ghi
       vào ghi chú nội bộ; người dân tra cứu chỉ thấy lời chung.
       Tin TỐ GIÁC bị đánh tin giả: giữ trong thùng rác tới khi lãnh đạo xem
       (không tự xoá sau 7 ngày) — một lần bấm không được làm mất tố giác thật. */
    await themGhiChu(id, req.staff.id, `[Tin giả] ${ghiChu}`);
    await pool.query('CALL update_submission_status(?,?,?,?,?)',
      [id, 'rejected', null, LOI_TU_CHOI_CONG_KHAI, req.staff.id]);
    await pool.query(
      `UPDATE submissions
          SET deleted_at = NOW(), deleted_by = ?, sang_loc_boi = ?, sang_loc_luc = NOW(),
              giu_cho_lanh_dao = ?
        WHERE id = ?`,
      [req.staff.id, req.staff.id, hs.nhom === 'to_giac' ? 1 : 0, id]
    );
  } else {
    /* Ngoài thẩm quyền: sang phần chỉ lãnh đạo. Đang giao cho cán bộ thì bỏ
       giao — người đó không còn mở được tin (cùng luật với route phân công). */
    const boGiao = hs.assigned_to != null && !laLanhDao({ role: hs.vai_tro_phu_trach });
    if (ghiChu) await themGhiChu(id, req.staff.id, `[Ngoài thẩm quyền] ${ghiChu}`);
    await pool.query(
      `UPDATE submissions
          SET ngoai_tham_quyen = 1, sang_loc_boi = ?, sang_loc_luc = NOW(),
              assigned_to = CASE WHEN ? = 1 THEN NULL ELSE assigned_to END
        WHERE id = ?`,
      [req.staff.id, boGiao ? 1 : 0, id]
    );
  }

  await ghiNhatKy(pool, req, {
    hanhDong: `sang_loc_${hanhDong}`, loaiDoiTuong: 'submission', doiTuongId: id,
    chiTiet: ghiChu ? { coGhiChu: true } : null,
  });
  const LOI = {
    xac_nhan: 'Đã xác nhận, tin chuyển vào xử lý.',
    chua_xac_minh: 'Đã gắn nhãn Chưa xác minh, tin ở lại hàng sàng lọc.',
    tin_gia: 'Đã đánh dấu tin giả, tin vào thùng rác (không khoá máy người gửi).',
    ngoai_tham_quyen: 'Đã chuyển sang phần Ngoài thẩm quyền (chỉ lãnh đạo xem).',
  };
  return { status: 200, body: { ok: true, message: LOI[hanhDong] } };
}

router.post('/:id/sang-loc', async (req, res) => {
  const id = soId(req.params.id);
  const hanhDong = String(req.body?.hanhDong ?? '');
  const ghiChu = chuoi(req.body?.ghiChu).slice(0, DO_DAI_GHI_CHU);
  if (!id) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  if (!HANH_DONG_SANG_LOC.includes(hanhDong)) return res.status(400).json({ error: 'Thao tác sàng lọc không hợp lệ.' });
  if (hanhDong === 'tin_gia' && ghiChu.length < LY_DO_TOI_THIEU) {
    return res.status(400).json({ error: 'Đánh dấu tin giả phải ghi rõ lý do.' });
  }
  if (!(await coCotSangLoc()) || !(await coCotCo())) return res.status(503).json({ error: LOI_THIEU_COT });
  try {
    const kq = await sangLocMotTin(req, id, hanhDong, ghiChu);
    res.status(kq.status).json(kq.body);
  } catch (err) {
    console.error('Lỗi sàng lọc:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/submissions/sang-loc-hang-loat  { ids, hanhDong, ghiChu }
 * Xác nhận hoặc đánh tin giả HÀNG LOẠT từ danh mục Tin trùng (ADR-003 việc 18).
 * Chạy đúng luật nút đơn cho TỪNG tin (kiểm phạm vi, trạng thái, ghi nhật ký
 * riêng từng tin); tin nào không làm được thì báo riêng tin đó, không dừng cả lô.
 * Chỉ hai thao tác: "Chưa xác minh" và "Ngoài thẩm quyền" cần xét từng tin.
 */
const HANH_DONG_HANG_LOAT = ['xac_nhan', 'tin_gia'];
const TOI_DA_HANG_LOAT = 50;

router.post('/sang-loc-hang-loat', async (req, res) => {
  const ids = req.body?.ids;
  const hanhDong = String(req.body?.hanhDong ?? '');
  const ghiChu = chuoi(req.body?.ghiChu).slice(0, DO_DAI_GHI_CHU);
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > TOI_DA_HANG_LOAT) {
    return res.status(400).json({ error: `Chọn từ 1 đến ${TOI_DA_HANG_LOAT} tin.` });
  }
  const dsId = ids.map((v) => (typeof v === 'number' ? soId(v) : null));
  if (dsId.some((v) => v == null)) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  if (!HANH_DONG_HANG_LOAT.includes(hanhDong)) {
    return res.status(400).json({ error: 'Chỉ xác nhận hoặc đánh tin giả được làm hàng loạt.' });
  }
  if (hanhDong === 'tin_gia' && ghiChu.length < LY_DO_TOI_THIEU) {
    return res.status(400).json({ error: 'Đánh dấu tin giả phải ghi rõ lý do.' });
  }
  if (!(await coCotSangLoc()) || !(await coCotCo())) return res.status(503).json({ error: LOI_THIEU_COT });

  const ketQua = [];
  for (const id of [...new Set(dsId)]) {
    try {
      const kq = await sangLocMotTin(req, id, hanhDong, ghiChu);
      ketQua.push({ id, status: kq.status, message: kq.body.message || kq.body.error });
    } catch (err) {
      console.error(`Lỗi sàng lọc hàng loạt (tin ${id}):`, err.message);
      ketQua.push({ id, status: 500, message: 'Lỗi máy chủ.' });
    }
  }
  const soXong = ketQua.filter((k) => k.status === 200).length;
  res.json({ ok: true, soXong, ketQua, message: `Đã xử lý ${soXong}/${ketQua.length} tin.` });
});

/**
 * GET /api/admin/submissions/tin-trung?phan=sang_loc|xu_ly|to_giac — DANH MỤC TIN TRÙNG
 * (ADR-003 việc 18, 19). Mỗi nhóm sự kiện là một hàng, đếm số tin CÒN MỞ trong
 * phần đó (sàng lọc: đang chờ; xử lý: đang xử lý) — tin đã đóng không tính
 * (việc 20). Nhóm có tin người xem không được đọc thì ẩn cả nhóm (BUG-009).
 * `gan_nhu_giong`: có hai tin giống nhau gần từng chữ — dấu hiệu một người gửi
 * lặp, khác "nhiều người kể cùng một vụ". Chỉ so NỘI DUNG; không dùng mã máy
 * hay mạng (nối đơn ẩn danh với đơn có tên — BUG-014).
 *
 * ⚠️ Router này gắn TRƯỚC router hồ sơ: GET /:id của router kia cũng khớp
 * /tin-trung nếu đứng trước.
 */
const PHAN_TIN_TRUNG = {
  sang_loc: { phan: 'sang_loc', trangThai: "s.status = 'received'" },
  xu_ly: { phan: 'xu_ly', trangThai: "s.status = 'processing'" },
  to_giac: { phan: 'to_giac', trangThai: "s.status = 'processing'" },
};
const NGUONG_GAN_NHU_GIONG = 0.85;

router.get('/tin-trung', async (req, res) => {
  const ma = String(req.query.phan ?? '');
  const cauHinh = Object.hasOwn(PHAN_TIN_TRUNG, ma) ? PHAN_TIN_TRUNG[ma] : null;
  if (!cauHinh) return res.status(400).json({ error: 'Phần danh sách không hợp lệ.' });
  const phan = timPhan(cauHinh.phan);
  try {
    const coCo = await coCotCo();
    const phamVi = await dieuKienNhomXem(req.staff);
    const dieuKien = [
      's.deleted_at IS NULL', '(s.is_spam IS NULL OR s.is_spam = 0)',
      phan.sql, cauHinh.trangThai, ...(coCo ? [phan.co] : []),
    ].join(' AND ');
    /* Mệnh đề dựng từ hằng của phần + điều kiện phạm vi; giá trị đi qua params */
    const whereSql = `WHERE ${[dieuKien, phamVi.sql].join(' AND ')}`;
    const [nhom] = await pool.query(
      `SELECT g.id, g.acknowledged, w.name AS ward_name, cg.name AS category_name,
              COUNT(s.id) AS so_tin, MIN(s.created_at) AS dau, MAX(s.created_at) AS cuoi
         FROM incident_groups g
         JOIN submissions s ON s.incident_group_id = g.id
         LEFT JOIN categories c ON c.id = s.category_id
         LEFT JOIN categories cg ON cg.id = g.category_id
         LEFT JOIN wards w ON w.id = g.ward_id
        ${whereSql}
        GROUP BY g.id, g.acknowledged, w.name, cg.name
       HAVING COUNT(s.id) >= 2
        ORDER BY cuoi DESC
        LIMIT 100`,
      phamVi.params
    );
    /* Nhóm đã qua phạm vi ở trên thì mọi thành viên đều xem được */
    const docThanhVien = async (nhomId) => {
      const whereSql = `WHERE s.incident_group_id = ? AND ${dieuKien}`;
      const [tv] = await pool.query(
        `SELECT s.original_content FROM submissions s LEFT JOIN categories c ON c.id = s.category_id
          ${whereSql}
          ORDER BY s.created_at ASC LIMIT 20`,
        [nhomId]
      );
      return tv;
    };
    const data = [];
    for (const g of nhom) {
      const tv = await docThanhVien(g.id);
      let ganNhuGiong = false;
      for (let i = 0; i < tv.length && !ganNhuGiong; i++) {
        for (let j = i + 1; j < tv.length; j++) {
          if (doTuongDong(tv[i].original_content, tv[j].original_content) >= NGUONG_GAN_NHU_GIONG) {
            ganNhuGiong = true; break;
          }
        }
      }
      data.push({
        ...g, so_tin: Number(g.so_tin), gan_nhu_giong: ganNhuGiong,
        xem_truoc: String(tv[0]?.original_content || '').slice(0, 160),
      });
    }
    res.json({ data });
  } catch (err) {
    console.error('Lỗi danh mục tin trùng:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ. Bạn đã chạy file nang_cap_v11.sql chưa?' });
  }
});

/**
 * POST /api/admin/submissions/:id/ngoai-tham-quyen  { hanhDong, ghiChu }  — CHỈ LÃNH ĐẠO
 * hanhDong: chuyen_lai (về xử lý) | xoa (vào thùng rác) | da_chuyen (đã chuyển
 * cơ quan có thẩm quyền — người dân tra cứu thấy)
 */
const HANH_DONG_NTQ = ['chuyen_lai', 'xoa', 'da_chuyen'];

router.post('/:id/ngoai-tham-quyen', authorize(...LANH_DAO), async (req, res) => {
  const id = soId(req.params.id);
  const hanhDong = String(req.body?.hanhDong ?? '');
  const ghiChu = chuoi(req.body?.ghiChu).slice(0, 500);
  if (!id) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  if (!HANH_DONG_NTQ.includes(hanhDong)) return res.status(400).json({ error: 'Thao tác không hợp lệ.' });
  if (!(await coCotCo())) return res.status(503).json({ error: LOI_THIEU_COT });

  try {
    const [thay] = await pool.query(
      `SELECT id, status FROM submissions
        WHERE id = ? AND COALESCE(ngoai_tham_quyen, 1) = 1 AND deleted_at IS NULL`,
      [id]
    );
    if (thay.length === 0) return res.status(409).json({ error: 'Tin này không nằm trong phần Ngoài thẩm quyền.' });

    if (hanhDong === 'chuyen_lai') {
      await pool.query('UPDATE submissions SET ngoai_tham_quyen = 0 WHERE id = ?', [id]);
      if (['received', 'pending_review'].includes(thay[0].status)) {
        await pool.query('CALL update_submission_status(?,?,?,?,?)',
          [id, 'processing', 'Lãnh đạo chuyển lại xử lý từ phần Ngoài thẩm quyền', null, req.staff.id]);
      }
    } else if (hanhDong === 'xoa') {
      /* Vào thùng rác, không xoá hẳn — còn khôi phục được trong 7 ngày */
      await pool.query('UPDATE submissions SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [req.staff.id, id]);
    } else {
      const loi = `Đã chuyển cơ quan có thẩm quyền${ghiChu ? `: ${ghiChu}` : ''}.`;
      await pool.query('CALL update_submission_status(?,?,?,?,?)', [id, 'resolved', loi, null, req.staff.id]);
      await pool.query('UPDATE submissions SET resolution_note = ? WHERE id = ?', [loi, id]);
    }

    await ghiNhatKy(pool, req, {
      hanhDong: `ntq_${hanhDong}`, loaiDoiTuong: 'submission', doiTuongId: id,
      chiTiet: ghiChu ? { ghiChu } : null,
    });
    const LOI = {
      chuyen_lai: 'Đã chuyển tin lại phần xử lý.',
      xoa: 'Đã đưa tin vào thùng rác.',
      da_chuyen: 'Đã ghi nhận chuyển cơ quan có thẩm quyền. Người dân tra cứu sẽ thấy.',
    };
    res.json({ ok: true, message: LOI[hanhDong] });
  } catch (err) {
    console.error('Lỗi phần ngoài thẩm quyền:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * GET /api/admin/submissions/ngoai-tham-quyen/xuat — XUẤT EXCEL (chỉ lãnh đạo)
 * Làm hồ sơ chuyển cơ quan có thẩm quyền. Danh tính CHE SẴN như báo cáo; ghi
 * export_data TRƯỚC khi trả (ghi không được thì không xuất).
 */
router.get('/ngoai-tham-quyen/xuat', authorize(...LANH_DAO), async (req, res) => {
  if (!(await coCotCo())) return res.status(503).json({ error: LOI_THIEU_COT });
  try {
    const [rows] = await pool.query(
      `SELECT s.tracking_code, s.status, s.is_anonymous, s.created_at, s.original_content,
              s.sender_name, c.name AS category_name, w.name AS ward_name
         FROM submissions s
         LEFT JOIN categories c ON c.id = s.category_id
         LEFT JOIN wards w ON w.id = s.ward_id
        WHERE COALESCE(s.ngoai_tham_quyen, 1) = 1 AND COALESCE(s.to_giac_mat, 1) = 0
          AND s.deleted_at IS NULL AND s.status <> 'spam'
        ORDER BY s.created_at DESC
        LIMIT 2000`
    );
    await ghiNhatKyTruoc(pool, req, {
      hanhDong: 'export_data', chiTiet: { phan: 'ngoai_tham_quyen', soDong: rows.length },
    });
    res.json(rows.map((r) => ({
      trackingCode: r.tracking_code,
      content: String(r.original_content || '').slice(0, 1000),
      category: r.category_name || '',
      ward: r.ward_name || '',
      status: r.status,
      sender: r.is_anonymous ? 'Ẩn danh' : maskName(decrypt(r.sender_name)),
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('Lỗi xuất ngoài thẩm quyền:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/submissions/:id/ghi-chu  { noiDung } — GHI CHÚ NỘI BỘ
 * Mọi cán bộ, trên hồ sơ mình xem được. Chỉ ghi thêm: không có đường sửa, xoá
 * (CSDL cũng chặn bằng trigger, nang_cap_v28.sql) — giữ đúng diễn biến xử lý.
 * Người dân tra cứu không thấy.
 */
router.post('/:id/ghi-chu', async (req, res) => {
  const id = soId(req.params.id);
  const noiDung = chuoi(req.body?.noiDung);
  if (!id) return res.status(400).json({ error: 'Mã hồ sơ không hợp lệ.' });
  if (!noiDung) return res.status(400).json({ error: 'Ghi chú không được để trống.' });
  if (noiDung.length > DO_DAI_GHI_CHU) {
    return res.status(400).json({ error: `Ghi chú tối đa ${DO_DAI_GHI_CHU} ký tự.` });
  }
  if (!(await coCotSangLoc())) return res.status(503).json({ error: LOI_THIEU_COT });
  try {
    const phamVi = await dieuKienXem(req.staff);
    const [thay] = await pool.query(`SELECT s.id FROM submissions s WHERE s.id = ? AND ${phamVi.sql}`, [id, ...phamVi.params]);
    if (thay.length === 0) return res.status(404).json({ error: 'Không tìm thấy ý kiến.' });
    await themGhiChu(id, req.staff.id, noiDung);
    /* Không chép nội dung ghi chú vào nhật ký — nhật ký nói AI ghi, LÚC NÀO */
    await ghiNhatKy(pool, req, {
      hanhDong: 'note_add', loaiDoiTuong: 'submission', doiTuongId: id, chiTiet: { doDai: noiDung.length },
    });
    res.status(201).json({ ok: true, message: 'Đã thêm ghi chú.' });
  } catch (err) {
    console.error('Lỗi ghi chú nội bộ:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
