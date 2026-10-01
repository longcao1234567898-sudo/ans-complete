/**
 * CỔNG VÀO (ADR-003 việc 23) — xem lib/cong-vao.js.
 *
 * POST /api/cong-vao/xac-minh  { captchaToken } -> { ve, hetHanGio }
 *
 * Gắn ở CẢ BA biến thể khởi động (index.js, may-chu-cong-khai.js,
 * may-chu-can-bo.js): trang công khai cần vé để gửi tin, trang cán bộ cần vé
 * để đăng nhập.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyTurnstile, turnstileEnabled } from '../lib/turnstile.js';
import { layIpThat } from '../lib/helpers.js';
import { capVe } from '../lib/cong-vao.js';

const router = Router();

/* Mỗi lượt xác minh là một lần gọi sang Cloudflare — chặn dội lệnh */
const gioiHan = rateLimit({
  windowMs: 15 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Thử xác minh quá nhiều lần. Bà con chờ ít phút rồi tải lại trang. Việc khẩn cấp xin gọi ngay 113.' },
});

router.post('/xac-minh', gioiHan, async (req, res) => {
  const token = req.body?.captchaToken;
  if (turnstileEnabled()) {
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ error: 'Chưa hoàn tất bước xác minh. Việc khẩn cấp xin gọi ngay 113.' });
    }
    const kq = await verifyTurnstile(token, layIpThat(req));
    if (!kq.ok) {
      return res.status(400).json({ error: 'Xác minh không thành công, bà con tải lại trang và thử lại. Việc khẩn cấp xin gọi ngay 113.' });
    }
  }
  res.json({ ve: capVe(), hetHanGio: 6, batBuoc: turnstileEnabled() });
});

export default router;
