/**
 * QUẢN LÝ ĐIỂM ĐEN GIAO THÔNG — cho cán bộ cập nhật ngay trên web.
 *
 * ⚠️ PHÂN QUYỀN: mọi vai trò ĐỌC được (cán bộ cơ sở cần biết địa bàn mình có
 *    điểm nào nguy hiểm), chỉ chỉ huy và quản trị VIẾT, SỬA, ẨN. Số liệu tai
 *    nạn là số liệu chính thức của đơn vị, phải qua người có trách nhiệm.
 *
 *    NGOẠI LỆ DUY NHẤT: PATCH /:id/ngap (báo "đang ngập / hết ngập" của đường
 *    hay ngập) — MỌI cán bộ đăng nhập làm được, vì người đứng ngoài đường lúc
 *    mưa là cán bộ cơ sở, không chờ lãnh đạo. Chỉ đổi một dấu thời gian, tự hết
 *    hạn sau 12 giờ (lib/duong-ngap.js), mỗi lượt đều ghi nhật ký kèm người báo.
 *
 * ⚠️ XOÁ LÀ ẨN, không xoá hẳn — giữ lịch sử để đối chiếu về sau.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { authorize } from '../../middleware/authorize.js';
import { LANH_DAO } from '../../lib/vai-tro.js';
import { ghiNhatKy } from '../../lib/helpers.js';
import { sanitizeText } from '../../lib/security.js';
import { chuanLoai, thieuCotNgap, DANG_NGAP_SQL } from '../../lib/duong-ngap.js';
import { duBaoMua, NGUON_GHI_CONG } from '../../lib/du-bao-mua.js';
import { docNguong, docLichSu, duongNguyCo, ghiMuaKhiNgap, nguongHopLe } from '../../lib/nguong-ngap.js';

const router = Router();

const MUC_DO_HOP_LE = ['cao', 'trung_binh', 'thap'];

function docDuLieu(body) {
  const ten = sanitizeText(String(body?.ten || '')).trim().slice(0, 200);
  if (ten.length < 5) return { loi: 'Tên khu quá ngắn (ít nhất 5 ký tự).' };

  const soVu = Math.max(0, Math.min(99999, Number(body?.soVu) || 0));
  const soTuVong = Math.max(0, Math.min(99999, Number(body?.soTuVong) || 0));
  const soBiThuong = Math.max(0, Math.min(99999, Number(body?.soBiThuong) || 0));

  /* Số người chết không thể nhiều hơn số vụ nhân lên vô lý, nhưng quan trọng
     hơn: nhập nhầm cột là chuyện thường. Nhắc luôn thay vì lưu số sai rồi
     công bố cho bà con đọc. */
  if (soTuVong > 0 && soVu === 0) {
    return { loi: 'Có người tử vong mà số vụ bằng 0 — bà con kiểm lại giúp.' };
  }

  const lat = body?.lat === null || body?.lat === '' ? null : Number(body.lat);
  const lng = body?.lng === null || body?.lng === '' ? null : Number(body.lng);
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    return { loi: 'Vĩ độ không hợp lệ.' };
  }
  if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    return { loi: 'Kinh độ không hợp lệ.' };
  }

  return {
    ten,
    mo_ta: sanitizeText(String(body?.moTa || '')).trim().slice(0, 2000) || null,
    lat, lng,
    ward_id: Number(body?.wardId) > 0 ? Number(body.wardId) : null,
    so_vu: soVu, so_tu_vong: soTuVong, so_bi_thuong: soBiThuong,
    ky_thong_ke: sanitizeText(String(body?.kyThongKe || '')).trim().slice(0, 100) || null,
    muc_do: MUC_DO_HOP_LE.includes(body?.mucDo) ? body.mucDo : 'trung_binh',
    khuyen_cao: sanitizeText(String(body?.khuyenCao || '')).trim().slice(0, 2000) || null,
    loai: chuanLoai(body?.loai),   // allow-list: ngoài 'tai_nan' | 'ngap' đều về 'tai_nan'
  };
}

/** GET / — danh sách, MỌI vai trò cán bộ xem được */
router.get('/', async (_req, res) => {
  try {
    /* dang_ngap do MÁY CHỦ tính (cùng biểu thức với trang người dân) — giao diện
       không tự so giờ, vì đồng hồ điện thoại cán bộ có thể lệch. Chưa chạy
       nang_cap_v31.sql thì rơi về câu cũ: danh sách vẫn mở, chỉ chưa có phần ngập. */
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT h.*, ${DANG_NGAP_SQL} AS dang_ngap, w.name AS dia_ban
           FROM traffic_hotspots h
           LEFT JOIN wards w ON w.id = h.ward_id
          ORDER BY h.is_published DESC,
                   FIELD(h.muc_do, 'cao', 'trung_binh', 'thap'),
                   h.so_tu_vong DESC`
      );
    } catch (e) {
      if (!thieuCotNgap(e)) throw e;
      [rows] = await pool.query(
        `SELECT h.*, w.name AS dia_ban
           FROM traffic_hotspots h
           LEFT JOIN wards w ON w.id = h.ward_id
          ORDER BY h.is_published DESC,
                   FIELD(h.muc_do, 'cao', 'trung_binh', 'thap'),
                   h.so_tu_vong DESC`
      );
    }
    /* Ngưỡng riêng và lịch sử ngập theo mưa của từng tuyến (P53). Chưa chạy
       nang_cap_v34.sql thì coBangNguong = false, danh sách vẫn đủ như cũ. */
    const nguong = await docNguong(pool);
    const lichSu = await docLichSu(pool, rows.filter((r) => r.loai === 'ngap').map((r) => r.id));
    res.json({
      coBang: true,
      coBangNguong: nguong !== null,
      ds: rows.map((r) => (r.loai === 'ngap'
        ? { ...r, nguong_mua_3h: nguong?.get(Number(r.id)) ?? null, ngap_theo_mua: lichSu.get(Number(r.id)) ?? null }
        : r)),
    });
  } catch (err) {
    /* PHÂN BIỆT RÕ hai trường hợp, vì cách xử lý khác hẳn nhau:
         - Bảng CHƯA TẠO  -> cần chạy nang_cap_v18.sql
         - Bảng CÓ, CHƯA CÓ DỮ LIỆU -> chỉ cần bấm thêm điểm

       Trước đây cả hai đều trả danh sách rỗng nên giao diện luôn hỏi "đã chạy
       SQL chưa?" — cán bộ đã chạy rồi vẫn bị hỏi, tưởng mình làm sai. */
    if (String(err.message).includes("doesn't exist")) {
      return res.json({ coBang: false, ds: [] });
    }
    console.error('Đọc điểm đen lỗi:', err.message);
    res.status(500).json({ error: 'Không tải được danh sách.' });
  }
});

/** POST / — thêm điểm đen. Chỉ chỉ huy và quản trị. */
router.post('/', authorize(...LANH_DAO), async (req, res) => {
  const d = docDuLieu(req.body);
  if (d.loi) return res.status(400).json({ error: d.loi });
  try {
    const chung = [d.ten, d.mo_ta, d.lat, d.lng, d.ward_id, d.so_vu, d.so_tu_vong,
      d.so_bi_thuong, d.ky_thong_ke, d.muc_do, d.khuyen_cao, req.staff?.id || null];
    let kq;
    try {
      [kq] = await pool.query(
        `INSERT INTO traffic_hotspots
           (ten, mo_ta, lat, lng, ward_id, so_vu, so_tu_vong, so_bi_thuong,
            ky_thong_ke, muc_do, khuyen_cao, created_by, loai)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...chung, d.loai]
      );
    } catch (e) {
      if (!thieuCotNgap(e)) throw e;
      /* Chưa chạy nang_cap_v31.sql: không lưu "đường ngập" thành điểm tai nạn
         một cách im lặng — báo rõ để chạy tệp rồi thêm lại. */
      if (d.loai === 'ngap') {
        return res.status(409).json({ error: 'Chưa thêm được đường hay ngập: cần chạy tệp database/nang_cap_v31.sql trên cơ sở dữ liệu trước.' });
      }
      [kq] = await pool.query(
        `INSERT INTO traffic_hotspots
           (ten, mo_ta, lat, lng, ward_id, so_vu, so_tu_vong, so_bi_thuong,
            ky_thong_ke, muc_do, khuyen_cao, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        chung
      );
    }
    await ghiNhatKy(pool, req, {
      hanhDong: 'hotspot_create', loaiDoiTuong: 'traffic_hotspot',
      doiTuongId: kq.insertId, chiTiet: { ten: d.ten, so_vu: d.so_vu, loai: d.loai },
    });
    res.status(201).json({ ok: true, id: kq.insertId, message: 'Đã thêm điểm cảnh báo.' });
  } catch (err) {
    console.error('Thêm điểm đen lỗi:', err.message);
    res.status(500).json({ error: 'Không thêm được.' });
  }
});

/** PUT /:id — sửa. Chỉ chỉ huy và quản trị. */
router.put('/:id', authorize(...LANH_DAO), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  const d = docDuLieu(req.body);
  if (d.loi) return res.status(400).json({ error: d.loi });
  try {
    const chung = [d.ten, d.mo_ta, d.lat, d.lng, d.ward_id, d.so_vu, d.so_tu_vong,
      d.so_bi_thuong, d.ky_thong_ke, d.muc_do, d.khuyen_cao];
    let kq;
    try {
      /* Đổi sang điểm tai nạn thì xoá luôn dấu "đang ngập" cũ: điểm tai nạn
         không có trạng thái ngập, để lại là dấu mồ côi. Vẫn là điểm ngập thì
         GIỮ nguyên xác nhận — sửa tên, toạ độ không được làm mất báo đang có. */
      [kq] = await pool.query(
        `UPDATE traffic_hotspots
            SET ten=?, mo_ta=?, lat=?, lng=?, ward_id=?, so_vu=?, so_tu_vong=?,
                so_bi_thuong=?, ky_thong_ke=?, muc_do=?, khuyen_cao=?, loai=?,
                ngap_xac_nhan_luc = IF(? = 'ngap', ngap_xac_nhan_luc, NULL)
          WHERE id = ?`,
        [...chung, d.loai, d.loai, id]
      );
    } catch (e) {
      if (!thieuCotNgap(e)) throw e;
      if (d.loai === 'ngap') {
        return res.status(409).json({ error: 'Chưa lưu được đường hay ngập: cần chạy tệp database/nang_cap_v31.sql trên cơ sở dữ liệu trước.' });
      }
      [kq] = await pool.query(
        `UPDATE traffic_hotspots
            SET ten=?, mo_ta=?, lat=?, lng=?, ward_id=?, so_vu=?, so_tu_vong=?,
                so_bi_thuong=?, ky_thong_ke=?, muc_do=?, khuyen_cao=?
          WHERE id = ?`,
        [...chung, id]
      );
    }
    if (kq.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy.' });
    await ghiNhatKy(pool, req, {
      hanhDong: 'hotspot_update', loaiDoiTuong: 'traffic_hotspot',
      doiTuongId: id, chiTiet: { ten: d.ten },
    });
    res.json({ ok: true, message: 'Đã lưu thay đổi.' });
  } catch (err) {
    res.status(500).json({ error: 'Không lưu được.' });
  }
});

/** PATCH /:id/hien — bật tắt hiển thị trên trang người dân */
router.patch('/:id/hien', authorize(...LANH_DAO), async (req, res) => {
  const id = Number(req.params.id);
  const hien = req.body?.hien === true;
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  try {
    const [kq] = await pool.query(
      'UPDATE traffic_hotspots SET is_published = ? WHERE id = ?', [hien ? 1 : 0, id]
    );
    if (kq.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy.' });
    await ghiNhatKy(pool, req, {
      hanhDong: hien ? 'hotspot_show' : 'hotspot_hide',
      loaiDoiTuong: 'traffic_hotspot', doiTuongId: id,
    });
    res.json({ ok: true, message: hien ? 'Đã hiện.' : 'Đã ẩn khỏi trang người dân.' });
  } catch (err) {
    res.status(500).json({ error: 'Không đổi được trạng thái.' });
  }
});

/**
 * PATCH /:id/ngap — báo "đang ngập" / "hết ngập" của một ĐƯỜNG HAY NGẬP.
 * MỌI cán bộ đăng nhập làm được (xem đầu tệp). Chỉ nhận đúng true / false.
 *   dangNgap: true  -> ghi/làm mới giờ xác nhận (còn hiệu lực 12 giờ)
 *   dangNgap: false -> xoá xác nhận
 */
/* authorize() không tham số = chỉ cần là cán bộ đăng nhập hợp lệ. Gọi tường minh dù
   index.js đã có requireAuth: route sửa dữ liệu công khai không được trông vào việc
   lớp ngoài không bao giờ hở (BUG-001). */
router.patch('/:id/ngap', authorize(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  const bat = req.body?.dangNgap;
  if (typeof bat !== 'boolean') return res.status(400).json({ error: 'Cần chọn đang ngập hay hết ngập.' });
  try {
    const [rows] = await pool.query('SELECT id, ten, loai FROM traffic_hotspots WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy.' });
    if (rows[0].loai !== 'ngap') {
      return res.status(400).json({ error: 'Điểm này là điểm đen tai nạn, không có trạng thái ngập.' });
    }
    /* Hai câu viết sẵn, không ghép chuỗi SQL theo biến (luật G8) */
    if (bat) {
      await pool.query("UPDATE traffic_hotspots SET ngap_xac_nhan_luc = NOW() WHERE id = ? AND loai = 'ngap'", [id]);
    } else {
      await pool.query("UPDATE traffic_hotspots SET ngap_xac_nhan_luc = NULL WHERE id = ? AND loai = 'ngap'", [id]);
    }
    await ghiNhatKy(pool, req, {
      hanhDong: bat ? 'hotspot_flood_on' : 'hotspot_flood_off',
      loaiDoiTuong: 'traffic_hotspot', doiTuongId: id, chiTiet: { ten: rows[0].ten },
    });
    /* Ghi lượng mưa lúc ngập để học ngưỡng của tuyến (P53) — chạy sau, cán bộ
       không phải chờ lấy dự báo */
    if (bat) ghiMuaKhiNgap(pool, { hotspotId: id, staffId: req.staff.id, layDuBao: () => duBaoMua.lay() });
    res.json({
      ok: true,
      message: bat
        ? 'Đã báo ĐANG NGẬP — hiện trên trang người dân, tự hết sau 12 giờ nếu không báo lại.'
        : 'Đã báo hết ngập.',
    });
  } catch (err) {
    if (thieuCotNgap(err)) {
      return res.status(409).json({ error: 'Cần chạy tệp database/nang_cap_v31.sql trên cơ sở dữ liệu trước.' });
    }
    console.error('Báo ngập lỗi:', err.message);
    res.status(500).json({ error: 'Không lưu được.' });
  }
});

/**
 * GET /du-bao-mua — cùng dự báo người dân thấy (lib/du-bao-mua.js, dùng chung bộ
 * nhớ đệm), thêm toạ độ đang dự báo và nó lấy từ đâu để cán bộ kiểm được đúng
 * địa bàn. Mức Cảnh báo trở lên là lúc nên cử người đi xem các tuyến hay ngập.
 * Máy chủ cán bộ chạy tách (may-chu-can-bo.js) không có route công khai, nên
 * trang cán bộ lấy dự báo qua đây.
 */
router.get('/du-bao-mua', authorize(), async (_req, res) => {
  try {
    const kq = await duBaoMua.lay();
    res.json(kq.trangThai === 'co_du_lieu'
      ? { ...kq, nguon: NGUON_GHI_CONG, duongNguyCo: await duongNguyCo(pool, kq).catch(() => []) }
      : kq);
  } catch (err) {
    console.error('Lỗi dự báo mưa:', err.message);
    res.json({ trangThai: 'khong_co_du_lieu' });
  }
});

/**
 * PUT /:id/nguong-mua — ngưỡng ngập riêng của một tuyến hay ngập (P53): mưa dồn 3
 * giờ từ bao nhiêu mm thì tuyến này có nguy cơ ngập. CHỈ lãnh đạo: con số này quyết
 * định người dân có được cảnh báo hay không. null = bỏ ngưỡng riêng, theo mức chung.
 * Mọi lần đặt ghi nhật ký (cũ -> mới).
 */
router.put('/:id/nguong-mua', authorize(...LANH_DAO), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Mã không hợp lệ.' });
  const moi = req.body?.nguongMua3h ?? null;
  if (!nguongHopLe(moi)) return res.status(400).json({ error: 'Ngưỡng phải là số nguyên từ 5 đến 300 mm (hoặc để trống để theo mức chung).' });
  try {
    const cu = await docNguong(pool);
    if (cu === null) return res.status(409).json({ error: 'Cần chạy tệp database/nang_cap_v34.sql trên cơ sở dữ liệu trước.' });
    const [rows] = await pool.query('SELECT id, ten, loai FROM traffic_hotspots WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy.' });
    if (rows[0].loai !== 'ngap') return res.status(400).json({ error: 'Chỉ đường hay ngập mới có ngưỡng mưa.' });
    if (moi === null) {
      await pool.query('DELETE FROM nguong_ngap_duong WHERE hotspot_id = ?', [id]);
    } else {
      await pool.query(
        `INSERT INTO nguong_ngap_duong (hotspot_id, nguong_mua_3h, cap_nhat_boi) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nguong_mua_3h = VALUES(nguong_mua_3h), cap_nhat_boi = VALUES(cap_nhat_boi), cap_nhat_luc = NOW()`,
        [id, moi, req.staff.id]
      );
    }
    await ghiNhatKy(pool, req, {
      hanhDong: 'hotspot_flood_threshold', loaiDoiTuong: 'traffic_hotspot', doiTuongId: id,
      chiTiet: { ten: rows[0].ten, cu: cu.get(id) ?? null, moi },
    });
    res.json({
      ok: true,
      message: moi === null
        ? 'Đã bỏ ngưỡng riêng — tuyến này theo mức cảnh báo chung.'
        : `Đã đặt: báo nguy cơ ngập khi dự báo mưa dồn 3 giờ từ ${moi} mm.`,
    });
  } catch (err) {
    console.error('Đặt ngưỡng ngập lỗi:', err.message);
    res.status(500).json({ error: 'Không lưu được.' });
  }
});

export default router;
