/**
 * ĐẾM LƯỢT TRUY CẬP — GET /api/thong-ke, POST /api/thong-ke/ghi-nhan
 * ============================================================================
 *
 * VÌ SAO CÓ: cho bà con và cán bộ thấy hệ thống đang được dùng thật. Với người
 * dân, con số "đã có N ý kiến được gửi" tạo niềm tin rằng đây là kênh có người
 * dùng, không phải trang web bỏ hoang. Với cán bộ, đó là số liệu báo cáo.
 *
 * ⚠️ CHỈ ĐẾM SỐ, KHÔNG LƯU DẤU VẾT NGƯỜI DÙNG.
 *
 *    Bảng site_visits gom theo NGÀY, mỗi ngày đúng một dòng. Không lưu địa chỉ
 *    mạng, không lưu mã thiết bị, không có cách nào truy ngược ai đã vào.
 *
 *    Đây là lựa chọn có chủ đích chứ không phải làm sơ sài: đây là hệ thống tố
 *    giác. Lưu dấu vết người truy cập nghĩa là lưu lại danh sách những người
 *    từng quan tâm tới việc báo tin cho công an — ở địa bàn nhỏ, danh sách đó
 *    lọt ra ngoài là nguy hiểm thật cho bà con.
 *
 *    Con số "khách" đếm bằng mã phiên ngẫu nhiên trình duyệt tự sinh, sống
 *    trong một phiên rồi mất. Nó chỉ dùng để không đếm trùng một người mở nhiều
 *    trang, không dùng để nhận dạng ai.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { layIpThat } from '../lib/helpers.js';

const router = Router();

/* Nhớ kết quả trong bộ nhớ để không hỏi database mỗi lần có người vào trang.
   Số thống kê không cần chính xác tới từng giây. */
let cache = { luc: 0, du_lieu: null };
const HAN_CACHE_MS = 60_000;

/* Giới hạn: một người mở nhiều trang nhanh vẫn chỉ ghi được chừng mực.
   Không chặn quá gắt vì đây là thao tác bình thường khi lướt web. */
const gioiHan = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => layIpThat(req),
  /* Vượt giới hạn thì lặng lẽ bỏ qua, KHÔNG báo lỗi — đếm lượt truy cập hỏng
     không được phép làm hỏng trải nghiệm đọc trang. */
  handler: (_req, res) => res.json({ ok: true }),
});

/** POST /api/thong-ke/ghi-nhan — ghi một lượt mở trang
 *
 *  body: { laKhachMoi?: boolean }  — true khi đây là phiên mới trong ngày
 */
router.post('/ghi-nhan', gioiHan, async (req, res) => {
  const laKhachMoi = req.body?.laKhachMoi === true;
  try {
    await pool.query(
      `INSERT INTO site_visits (ngay, luot_xem, luot_khach)
       VALUES (CURDATE(), 1, ?)
       ON DUPLICATE KEY UPDATE
         luot_xem = luot_xem + 1,
         luot_khach = luot_khach + VALUES(luot_khach)`,
      [laKhachMoi ? 1 : 0]
    );
  } catch (err) {
    /* Bảng chưa tạo (chưa chạy nang_cap_v18.sql) -> bỏ qua. Đếm lượt là việc
       phụ, không được làm hỏng việc chính. */
    if (!String(err.message).includes("doesn't exist")) {
      console.warn('[thống kê] không ghi được lượt xem:', err.message);
    }
  }
  res.json({ ok: true });
});

/** GET /api/thong-ke — số liệu tổng hợp để hiện ở trang chủ */
router.get('/', async (_req, res) => {
  if (cache.du_lieu && Date.now() - cache.luc < HAN_CACHE_MS) {
    return res.json(cache.du_lieu);
  }

  const kq = {
    tongYKien: 0,
    yKienDaXuLy: 0,
    luotTruyCap: 0,
    khachHomNay: 0,
    ngayHoatDong: 0,
  };

  try {
    /* Số ý kiến — đếm từ bảng submissions, không phụ thuộc bảng thống kê mới,
       nên phần này chạy được ngay cả khi chưa chạy nang_cap_v18.sql. */
    const [[yk]] = await pool.query(
      `SELECT COUNT(*) AS tong,
              SUM(status = 'resolved') AS da_xu_ly,
              DATEDIFF(CURDATE(), MIN(DATE(created_at))) AS so_ngay
         FROM submissions
        WHERE deleted_at IS NULL
          AND (is_spam IS NULL OR is_spam = 0)
          AND status <> 'spam'`
    );
    kq.tongYKien = Number(yk?.tong || 0);
    kq.yKienDaXuLy = Number(yk?.da_xu_ly || 0);
    kq.ngayHoatDong = Math.max(1, Number(yk?.so_ngay || 0) + 1);
  } catch (err) {
    console.warn('[thống kê] không đếm được ý kiến:', err.message);
  }

  try {
    const [[tc]] = await pool.query(
      `SELECT COALESCE(SUM(luot_xem), 0) AS tong_xem,
              COALESCE(MAX(CASE WHEN ngay = CURDATE() THEN luot_khach END), 0) AS khach_hom_nay
         FROM site_visits`
    );
    kq.luotTruyCap = Number(tc?.tong_xem || 0);
    kq.khachHomNay = Number(tc?.khach_hom_nay || 0);
  } catch {
    /* Bảng chưa tạo -> để 0, trang vẫn hiện được phần số ý kiến. */
  }

  cache = { luc: Date.now(), du_lieu: kq };
  res.json(kq);
});

export default router;
