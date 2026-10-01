/**
 * SỰ KIỆN CHỤP / IN MÀN HÌNH TRANG CÁN BỘ (ADR-003 việc 26)
 *
 * POST /api/admin/su-kien-man-hinh  { loai, duong }  -> 204
 *
 * Trang web không chặn tuyệt đối được việc chụp, quay màn hình. Giao diện làm
 * phần răn đe (chữ chìm mang tên người xem, làm mờ khi rời cửa sổ, chặn in,
 * chuột phải, sao chép); route này lo phần TRUY VẾT: bắt được phím chụp màn
 * hình hoặc lệnh in thì ghi nhật ký đích danh, kèm trang đang xem.
 * Bấm liên tục trong một phút gộp một dòng — để nhật ký không ngập.
 */
import { Router } from 'express';
import { pool } from '../../db.js';
import { ghiNhatKy } from '../../lib/helpers.js';

const router = Router();

const LOAI = ['phim_chup_man_hinh', 'in_trang'];
/* Chỉ nhận đường dẫn trang cán bộ — không để trường này thành chỗ nhồi chữ tuỳ ý vào nhật ký */
const DANG_DUONG = /^\/quan-tri(\/[A-Za-z0-9_-]+)*\/?$/;

router.post('/', async (req, res) => {
  const loai = req.body?.loai;
  const duong = req.body?.duong ?? '/quan-tri';
  if (typeof loai !== 'string' || !LOAI.includes(loai)) return res.status(400).json({ error: 'Sự kiện không hợp lệ.' });
  if (typeof duong !== 'string' || duong.length > 120 || !DANG_DUONG.test(duong)) {
    return res.status(400).json({ error: 'Đường dẫn không hợp lệ.' });
  }
  await ghiNhatKy(pool, req, {
    hanhDong: 'screen_capture_attempt', loaiDoiTuong: 'staff', chiTiet: { loai, duong }, gopPhut: 1,
  });
  res.status(204).end();
});

export default router;
