/**
 * BẢN ĐỒ AN NINH CÔNG KHAI — GET /api/ban-do
 * ============================================================================
 *
 * Cho NGƯỜI DÂN xem tình hình an ninh trên địa bàn mình sống, không cần đăng
 * nhập. Ý nghĩa: bà con biết khu mình đang có vấn đề gì để phòng ngừa, và thấy
 * được công an đang xử lý — minh bạch tạo niềm tin, có niềm tin thì mới báo tin.
 *
 * ⚠️ KHÁC HẲN BẢN ĐỒ CỦA CÁN BỘ. Bản này chỉ trả về:
 *      - Tên địa bàn và toạ độ trung tâm
 *      - TỔNG SỐ tin đã tiếp nhận trong kỳ
 *      - Phân bố theo NHÓM việc (tố giác / khiếu nại / phản ánh / đề xuất)
 *
 *    TUYỆT ĐỐI KHÔNG trả về: nội dung tin, danh tính người báo, thời điểm cụ
 *    thể từng tin, trạng thái xử lý từng tin, hay toạ độ chính xác vụ việc.
 *    Lộ những thứ đó là lộ người tố giác — nguy hiểm thật ở địa bàn nhỏ nơi
 *    mọi người biết mặt nhau.
 *
 * ⚠️ CHE SỐ NHỎ: địa bàn có DƯỚI 3 tin trong kỳ thì KHÔNG hiện số, chỉ ghi
 *    "chưa đủ dữ liệu". Ở ấp nhỏ, thấy "ấp X có 1 tin tố giác" là gần như chỉ
 *    đích danh được ai đã báo. Đây là nguyên tắc chuẩn khi công bố số liệu.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { layIpThat } from '../lib/helpers.js';

const router = Router();

/* Ngưỡng che số nhỏ — xem chú thích đầu tệp. */
const NGUONG_CHE = 3;

/* Giới hạn tần suất: đây là dữ liệu tổng hợp công khai, nhưng vẫn chặn việc
   gọi liên tục để dò biến động số liệu theo thời gian. */
const gioiHan = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => layIpThat(req),
  message: { error: 'Bà con xem hơi nhanh. Thử lại sau một phút.' },
});

router.get('/', gioiHan, async (req, res) => {
  /* Khoảng thời gian: mặc định 30 ngày, giới hạn 7 tới 90 ngày.
     Không cho xem quá xa để tránh dựng lại lịch sử địa bàn. */
  const ngay = Math.min(90, Math.max(7, Number(req.query.ngay) || 30));

  try {
    const [rows] = await pool.query(
      `SELECT w.id, w.name, w.lat, w.lng,
              COUNT(s.id) AS tong,
              SUM(c.code = 'to_giac')   AS to_giac,
              SUM(c.code = 'khieu_nai') AS khieu_nai,
              SUM(c.code = 'phan_anh')  AS phan_anh,
              SUM(c.code = 'de_xuat')   AS de_xuat
         FROM wards w
         LEFT JOIN submissions s
                ON s.ward_id = w.id
               AND s.deleted_at IS NULL
               AND (s.is_spam IS NULL OR s.is_spam = 0)
               AND s.status NOT IN ('spam', 'pending_review', 'rejected')
               AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         LEFT JOIN categories c ON c.id = s.category_id
        WHERE w.lat IS NOT NULL AND w.lng IS NOT NULL
        GROUP BY w.id, w.name, w.lat, w.lng
        ORDER BY w.name`,
      [ngay]
    );

    res.json({
      ngay,
      nguongChe: NGUONG_CHE,
      diaBan: rows.map((r) => {
        const tong = Number(r.tong || 0);
        /* Dưới ngưỡng -> KHÔNG trả số thật, chỉ báo chưa đủ dữ liệu.
           Trả về 0 cũng không được: người xem trừ đi là suy ra được. */
        const duLieuIt = tong > 0 && tong < NGUONG_CHE;
        return {
          id: r.id,
          ten: r.name,
          lat: Number(r.lat),
          lng: Number(r.lng),
          duLieuIt,
          tong: duLieuIt ? null : tong,
          nhom: duLieuIt ? null : {
            to_giac: Number(r.to_giac || 0),
            khieu_nai: Number(r.khieu_nai || 0),
            phan_anh: Number(r.phan_anh || 0),
            de_xuat: Number(r.de_xuat || 0),
          },
        };
      }),
    });
  } catch (err) {
    console.error('Lỗi bản đồ công khai:', err.message);
    res.status(500).json({ error: 'Chưa xem được bản đồ lúc này.' });
  }
});

export default router;
