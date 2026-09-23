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

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT h.id, h.ten, h.mo_ta, h.lat, h.lng, h.so_vu, h.so_tu_vong,
              h.so_bi_thuong, h.ky_thong_ke, h.muc_do, h.khuyen_cao,
              w.name AS dia_ban
         FROM traffic_hotspots h
         LEFT JOIN wards w ON w.id = h.ward_id
        WHERE h.is_published = 1
        ORDER BY FIELD(h.muc_do, 'cao', 'trung_binh', 'thap'), h.so_tu_vong DESC, h.so_vu DESC`
    );

    res.json(rows.map((r) => ({
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
    })));
  } catch (err) {
    /* Bảng chưa tạo (chưa chạy nang_cap_v18.sql) -> trả danh sách rỗng, trang
       vẫn mở được và hiện lời nhắn "chưa có dữ liệu". Thà trang trống có giải
       thích còn hơn trang lỗi. */
    if (String(err.message).includes("doesn't exist")) return res.json([]);
    console.error('Lỗi điểm đen:', err.message);
    res.status(500).json({ error: 'Chưa xem được lúc này.' });
  }
});

export default router;
