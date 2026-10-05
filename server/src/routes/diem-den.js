/**
 * ĐIỂM ĐEN GIAO THÔNG — GET /api/diem-den
 * ============================================================================
 *
 * Công khai cho người dân, không cần đăng nhập. Cho bà con biết khu nào hay
 * xảy ra tai nạn để đi qua cẩn thận hơn.
 *
 * VÌ SAO ĐÁNG LÀM: khác với tin tố giác, số liệu tai nạn giao thông là thông
 * tin CÀNG NHIỀU NGƯỜI BIẾT CÀNG TỐT. Một người biết "ngã tư này năm nay đã có
 * ba vụ, một người chết" thì tự khắc đi chậm lại khi qua đó. Đây là phòng ngừa
 * rẻ nhất và hiệu quả nhất.
 *
 * ⚠️ KHÁC HẲN bản đồ ý kiến: ở đây KHÔNG che số. Số vụ tai nạn là số liệu công
 *    khai của ngành giao thông, không suy ra được danh tính ai. Che số ở đây
 *    chỉ làm mất tác dụng cảnh báo.
 */
import { Router } from 'express';
import { pool } from '../db.js';
import { DANG_NGAP_SQL, thieuCotNgap } from '../lib/duong-ngap.js';
import { duBaoMua, banCongKhai } from '../lib/du-bao-mua.js';
import { duongNguyCo } from '../lib/nguong-ngap.js';

const router = Router();

/* Câu truy vấn đầy đủ (đã chạy nang_cap_v31.sql) và bản cũ (chưa có hai cột loai,
   ngap_xac_nhan_luc). Chưa nâng cấp CSDL thì trang vẫn hiện điểm tai nạn như
   trước, chỉ chưa có phần đường ngập — không để cả trang lỗi vì thiếu một cột. */
const SQL_MOI = `SELECT h.id, h.ten, h.mo_ta, h.lat, h.lng, h.so_vu, h.so_tu_vong,
       h.so_bi_thuong, h.ky_thong_ke, h.muc_do, h.khuyen_cao, h.loai,
       ${DANG_NGAP_SQL} AS dang_ngap, h.ngap_xac_nhan_luc, w.name AS dia_ban
  FROM traffic_hotspots h LEFT JOIN wards w ON w.id = h.ward_id
 WHERE h.is_published = 1
 ORDER BY ${DANG_NGAP_SQL} DESC, FIELD(h.muc_do, 'cao', 'trung_binh', 'thap'), h.so_tu_vong DESC, h.so_vu DESC`;
const SQL_CU = `SELECT h.id, h.ten, h.mo_ta, h.lat, h.lng, h.so_vu, h.so_tu_vong,
       h.so_bi_thuong, h.ky_thong_ke, h.muc_do, h.khuyen_cao, w.name AS dia_ban
  FROM traffic_hotspots h LEFT JOIN wards w ON w.id = h.ward_id
 WHERE h.is_published = 1
 ORDER BY FIELD(h.muc_do, 'cao', 'trung_binh', 'thap'), h.so_tu_vong DESC, h.so_vu DESC`;

async function docDiem() {
  try {
    return (await pool.query(SQL_MOI))[0];
  } catch (err) {
    if (!thieuCotNgap(err)) throw err;
    return (await pool.query(SQL_CU))[0];
  }
}

router.get('/', async (_req, res) => {
  try {
    const rows = await docDiem();

    res.json(rows.map((r) => {
      const dangNgap = Boolean(Number(r.dang_ngap));
      return {
        id: r.id,
        ten: r.ten,
        moTa: r.mo_ta,
        lat: r.lat === null ? null : Number(r.lat),
        lng: r.lng === null ? null : Number(r.lng),
        soVu: Number(r.so_vu || 0),
        soTuVong: Number(r.so_tu_vong || 0),
        soBiThuong: Number(r.so_bi_thuong || 0),
        kyThongKe: r.ky_thong_ke,
        mucDo: r.muc_do,
        khuyenCao: r.khuyen_cao,
        diaBan: r.dia_ban,
        loai: r.loai === 'ngap' ? 'ngap' : 'tai_nan',
        dangNgap,
        /* Giờ xác nhận chỉ trả khi ĐANG ngập: giờ của lần xác nhận đã hết hạn
           không có ích gì cho người dân và lộ nhịp làm việc của cán bộ. */
        ngapLuc: dangNgap && r.ngap_xac_nhan_luc ? new Date(r.ngap_xac_nhan_luc).toISOString() : null,
      };
    }));
  } catch (err) {
    /* Bảng chưa tạo (chưa chạy nang_cap_v18.sql) -> trả danh sách rỗng, trang
       vẫn mở được và hiện lời nhắn "chưa có dữ liệu". Thà trang trống có giải
       thích còn hơn trang lỗi. */
    if (String(err.message).includes("doesn't exist")) return res.json([]);
    console.error('Lỗi điểm đen:', err.message);
    res.status(500).json({ error: 'Chưa xem được lúc này.' });
  }
});

/**
 * GET /api/diem-den/du-bao-mua — mức nguy cơ ngập theo lượng mưa dự báo (P51).
 * Máy chủ tự lấy từ Open-Meteo và giữ 30 phút (lib/du-bao-mua.js); người dân
 * chỉ gọi máy chủ mình. Luôn trả 200 kèm `trangThai` — lỗi lấy dữ liệu là
 * "khong_co_du_lieu", không phải 500 và không phải mức Bình thường.
 */
router.get('/du-bao-mua', async (_req, res) => {
  try {
    /* Không đặt Cache-Control cho trình duyệt giữ: máy chủ đã giữ 30 phút, giữ thêm
       ở trình duyệt chỉ chồng thêm độ cũ — vd. máy chủ đã thôi báo vì mất dữ liệu mà
       trình duyệt vẫn hiện mức cũ. */
    const kq = await duBaoMua.lay();
    const ra = banCongKhai(kq);
    /* Tuyến nào có nguy cơ — theo ngưỡng riêng của từng tuyến nếu lãnh đạo đã đặt
       (P53), không thì theo mức chung. Tính ở máy chủ: trang chủ và trang Điểm đen
       cùng một kết luận. */
    if (kq.trangThai === 'co_du_lieu') ra.duongNguyCo = await duongNguyCo(pool, kq).catch(() => []);
    res.json(ra);
  } catch (err) {
    console.error('Lỗi dự báo mưa:', err.message);
    res.json({ trangThai: 'khong_co_du_lieu' });
  }
});

export default router;
