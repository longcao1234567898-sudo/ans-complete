/** Các endpoint AI — key Gemini nằm phía server, trình duyệt không thấy */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { aiAvailable, geminiChat, geminiAnalyze, geminiModerateImage } from '../lib/ai.js';
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
  if (!aiAvailable()) return res.status(503).json({ error: 'AI chưa được cấu hình.' });
  const content = sanitizeText(req.body?.content || '', 2000);
  if (!content) return res.status(400).json({ error: 'Nội dung trống.' });
  try {
    res.json(await geminiAnalyze(content));
  } catch (err) {
    console.error('AI analyze lỗi:', err.message);
    res.status(502).json({ error: 'AI phân tích thất bại.' });
  }
});

router.post('/moderate-image', async (req, res) => {
  if (!aiAvailable()) return res.json({ blocked: false }); // không có AI thì không chặn ở tầng này
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'Thiếu ảnh.' });
  try {
    const sensitive = await geminiModerateImage(dataUrl);
    res.json(sensitive ? { blocked: true, reason: 'AI phát hiện hình ảnh nhạy cảm/khiêu dâm' } : { blocked: false });
  } catch (err) {
    console.error('AI moderate lỗi:', err.message);
    res.json({ blocked: false }); // lỗi AI thì để tầng heuristic phía client quyết
  }
});

export default router;
