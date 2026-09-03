/**
 * MÁY CHỦ CÔNG KHAI — chỉ phục vụ người dân.
 * ============================================================================
 *
 * Dùng khi BÀN GIAO, tách khỏi máy chủ cán bộ. Máy chủ này ra Internet cho dân
 * gửi ý kiến, xem tin tức, tra cứu — KHÔNG chứa bất kỳ route cán bộ nào. Kẻ tấn
 * công có chọc thủng máy chủ này cũng không chạm được tới chức năng quản trị,
 * vì mã quản trị không nạp ở đây.
 *
 * Chạy:  node src/may-chu-cong-khai.js
 * Cổng:  PORT (mặc định 4000)
 *
 * Lúc DEMO thì không cần chạy tệp này — cứ dùng index.js gộp cả hai cho gọn.
 * Tệp này để sẵn cho ngày đơn vị tách hai máy chủ.
 * ============================================================================
 */
import 'dotenv/config';
import { pool } from './db.js';
import { loadBannedWords } from './lib/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import { taoApp, ganDuoi } from './nen-tang.js';

import authRouter from './routes/auth.js';
import trackingRouter from './routes/tracking.js';
import chatRouter from './routes/chat.js';
import newsRouter from './routes/news.js';
import banDoRouter from './routes/ban-do.js';
import khieuNaiRouter from './routes/khieu-nai.js';
import ttsRouter from './routes/tts.js';
import submissionsRouter from './routes/submissions.js';
import otpRouter from './routes/otp.js';
import aiRouter from './routes/ai.js';

const app = taoApp({ ten: 'cong-khai' });
const PORT = process.env.PORT || 4000;

/* CHỈ route công khai. Không có adminRouter ở đây — đó là điểm mấu chốt. */
app.use('/api/auth', authRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/chat', chatRouter);
app.use('/api/news', newsRouter);
/* Bản đồ an ninh CÔNG KHAI cho người dân — số liệu tổng hợp, che số nhỏ. */
app.use('/api/ban-do', banDoRouter);
/* Khiếu nại mở khoá — KHÔNG cần đăng nhập, vì người bị khoá không có tài khoản. */
app.use('/api/khieu-nai', khieuNaiRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/otp', otpRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/ai', aiRouter);

ganDuoi(app, errorHandler);

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ [công khai] Kết nối MySQL thành công');
    await loadBannedWords(pool).catch((e) => console.warn('Không nạp được banned_words:', e.message));
  } catch (err) {
    console.error('❌ [công khai] KHÔNG kết nối được MySQL:', err.message);
  }
  app.listen(PORT, () => console.log(`🌐 Máy chủ CÔNG KHAI chạy ở cổng ${PORT}`));
}
start();
