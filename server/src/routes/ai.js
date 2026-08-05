/** Các endpoint AI — key Gemini nằm phía server, trình duyệt không thấy */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { aiAvailable, geminiChat } from '../lib/ai.js';
import { phanLoaiNoiDung } from '../lib/phan-loai.js';
import { sanitizeText } from '../lib/security.js';

const router = Router();

// Giới hạn gọi AI để bảo vệ quota key: 30 lượt / 5 phút / IP
const aiLimiter = rateLimit({ windowMs: 5 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
router.use(aiLimiter);

/** Cho frontend biết server có bật AI hay không */
router.get('/status', (_req, res) => res.json({ available: aiAvailable() }));

router.post('/chat', async (req, res) => {
  if (!aiAvailable()) return res.status(503).json({ error: 'AI chưa được cấu hình.' });
  const message = sanitizeText(req.body?.message || '', 1000);
  if (!message) return res.status(400).json({ error: 'Tin nhắn trống.' });
  try {
    const reply = await geminiChat(message, Array.isArray(req.body?.history) ? req.body.history : []);
    res.json({ reply });
  } catch (err) {
    console.error('AI chat lỗi:', err.message);
    res.status(502).json({ error: 'AI tạm thời không phản hồi.' });
  }
});

router.post('/analyze', async (req, res) => {
  /* PHÂN LOẠI HOÀN TOÀN NỘI BỘ — không gọi AI bên ngoài.
     Vì vậy KHÔNG kiểm tra aiAvailable(): mất khoá AI thì phân loại vẫn chạy. */
  const content = sanitizeText(req.body?.content || '', 2000);
  if (!content) return res.status(400).json({ error: 'Nội dung trống.' });
  try {
    res.json(phanLoaiNoiDung(content));
  } catch (err) {
    console.error('Phân loại lỗi:', err.message);
    res.status(500).json({ error: 'Không phân loại được nội dung.' });
  }
});

router.post('/moderate-image', async (_req, res) => {
  /* ĐÃ BỎ kiểm duyệt ảnh bằng AI ngoài.
     Lý do: ảnh người dân gửi kèm tố giác là dữ liệu nhạy cảm nhất — có thể
     chứa mặt người, biển số, địa chỉ. Gửi sang dịch vụ ngoài là rủi ro lớn
     hơn nhiều so với lợi ích lọc được vài ảnh xấu.
     Việc lọc nay do lớp heuristic ở trình duyệt (đo tỷ lệ màu da) và cán bộ
     duyệt thủ công đảm nhiệm. */
  res.json({ blocked: false, reason: 'Kiểm duyệt ảnh bằng AI ngoài đã được gỡ bỏ.' });
});

export default router;
