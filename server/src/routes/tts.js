/**
 * ĐỌC TIẾNG VIỆT QUA MÁY CHỦ — GET /api/tts?q=...
 * ============================================================================
 *
 * VÌ SAO CẦN ROUTE NÀY
 *
 * Nút loa trên web dùng Web Speech API của trình duyệt. Nhưng nhiều máy tính
 * và điện thoại KHÔNG cài sẵn giọng đọc tiếng Việt — khi đó trình duyệt lấy
 * giọng tiếng Anh đọc chữ tiếng Việt, nghe sai hoàn toàn.
 *
 * Giải pháp phía trình duyệt (gọi thẳng dịch vụ đọc của Google) không chạy
 * được: các dịch vụ đó chặn gọi trực tiếp từ web khác (thiếu CORS header,
 * kiểm tra Referer). Trình duyệt báo lỗi "định dạng không hỗ trợ".
 *
 * Cách chắc ăn: để MÁY CHỦ đọc hộ. Trình duyệt gọi API của chính hệ thống
 * (cùng tên miền, không vướng CORS), máy chủ lấy tệp âm thanh tiếng Việt về
 * rồi trả lại. Máy người dùng có cài giọng Việt hay không cũng không còn quan
 * trọng — âm thanh đã được đọc sẵn ở phía máy chủ.
 *
 * Đây đúng vai trò "backend proxy" mà mọi dịch vụ đọc đều yêu cầu khi dùng từ
 * web. Không cần khoá API, không tốn tiền.
 * ============================================================================
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { layIpThat } from '../lib/helpers.js';

const router = Router();

/* Giới hạn tần suất: đọc là việc người dùng bấm tay, không cần nhiều. Chặn lạm
   dụng biến route thành proxy tải hộ. Khoá theo IP đã chuẩn hoá. */
const gioiHan = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => layIpThat(req),
  message: { error: 'Bạn nghe quá nhanh, thử lại sau một phút.' },
});

/* Host đọc CỐ ĐỊNH — người dùng không đổi được đích gọi, chỉ nối thêm nội dung
   cần đọc vào cuối (đã mã hoá). Tách ra hằng số để rõ đây không phải SSRF. */
const TTS_HOST = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=';

/* Độ dài tối đa mỗi lần đọc. Dịch vụ đọc của Google giới hạn ~200 ký tự/lần,
   nên phía trình duyệt đã cắt nhỏ rồi mới gọi. Ở đây chặn cứng phòng lạm dụng. */
const MAX_DAI = 220;

router.get('/', gioiHan, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Thiếu nội dung cần đọc.' });
  if (q.length > MAX_DAI) {
    return res.status(400).json({ error: `Đoạn quá dài (tối đa ${MAX_DAI} ký tự mỗi lần).` });
  }

  try {
    /* Điểm cuối đọc của Google Dịch: trả về tệp mp3 đọc tiếng Việt. Gọi TỪ MÁY
       CHỦ nên không vướng CORS. Gửi kèm User-Agent và Referer để không bị chặn
       — đây là lý do gọi thẳng từ trình duyệt thất bại. tl=vi là tiếng Việt.

       AN TOÀN SSRF: host cố định TTS_HOST, người dùng CHỈ chi phối phần query q
       và đã qua encodeURIComponent + giới hạn độ dài. Không thể đổi đích gọi
       sang máy chủ nội bộ hay địa chỉ khác. */
    const duongDan = TTS_HOST + encodeURIComponent(q);
    const r = await fetch(duongDan, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!r.ok) {
      console.warn('[tts] nguồn đọc trả lỗi', r.status);
      return res.status(502).json({ error: 'Không lấy được âm thanh.' });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    /* Cho phép trình duyệt lưu tạm 1 ngày — cùng một câu (tiêu đề tin, hướng
       dẫn bước) đọc lại nhiều lần thì không phải tải lại. */
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('[tts] lỗi:', err.message);
    res.status(502).json({ error: 'Không đọc được lúc này.' });
  }
});

export default router;
