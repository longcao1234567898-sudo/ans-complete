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
import { chuanLoai, thieuCotNgap } from '../../lib/duong-ngap.js';

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
    const [rows] = await pool.query(
      `SELECT h.*, w.name AS dia_ban
         FROM traffic_hotspots h
         LEFT JOIN wards w ON w.id = h.ward_id
        ORDER BY h.is_published DESC,
                 FIELD(h.muc_do, 'cao', 'trung_binh', 'thap'),
                 h.so_tu_vong DESC`
    );
    res.json({ coBang: true, ds: rows });
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

export default router;
