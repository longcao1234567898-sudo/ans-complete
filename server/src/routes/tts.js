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

/* Nhiều nguồn đọc, thử lần lượt. Lý do: một số nguồn chặn IP trung tâm dữ liệu
   (Render, Railway...) dù chạy tốt từ máy thường. Nguồn này chặn thì thử nguồn
   kia. Tất cả đều là điểm cuối đọc tiếng Việt công khai, không cần khoá API.

   AN TOÀN SSRF: các host CỐ ĐỊNH, người dùng chỉ chi phối phần q (đã
   encodeURIComponent + giới hạn độ dài). Không đổi được đích gọi. */
const TTS_NGUON = [
  (q) => `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(q)}`,
  (q) => `https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=vi&client=gtx&q=${encodeURIComponent(q)}`,
];

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
    /* Thử lần lượt từng nguồn đọc. Nguồn nào trả về mp3 hợp lệ thì dùng luôn.
       Gọi TỪ MÁY CHỦ nên không vướng CORS. Gửi kèm User-Agent và Referer để
       nguồn không chặn — đây là lý do gọi thẳng từ trình duyệt thất bại.

       AN TOÀN SSRF: host cố định trong TTS_NGUON, người dùng chỉ chi phối q đã
       qua encodeURIComponent + giới hạn độ dài. */
    let buf = null;
    let loiCuoi = '';
    for (const taoUrl of TTS_NGUON) {
      try {
        const r = await fetch(taoUrl(q), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://translate.google.com/',
          },
        });
        if (!r.ok) { loiCuoi = `HTTP ${r.status}`; continue; }
        const b = Buffer.from(await r.arrayBuffer());
        /* Nguồn bị chặn đôi khi trả về trang HTML lỗi 200 rất nhỏ thay vì mp3.
           Chặn cứng: mp3 đọc được luôn lớn hơn 1KB. */
        if (b.length < 1024) { loiCuoi = `tệp quá nhỏ (${b.length} byte)`; continue; }
        buf = b;
        break;
      } catch (e) {
        loiCuoi = e.message;
      }
    }

    if (!buf) {
      console.warn('[tts] mọi nguồn đọc đều lỗi:', loiCuoi);
      return res.status(502).json({ error: 'Không lấy được âm thanh.' });
    }

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
