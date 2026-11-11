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
import { batTuDonDauNoi } from './lib/vong-doi-dau-noi.js';
import { batGiuThuc } from './lib/giu-thuc.js';
import { loadBannedWords } from './lib/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import { taoApp, ganDuoi, diaChiNghe } from './nen-tang.js';

import congVaoRouter from './routes/cong-vao.js';
import { kiemKhoaTurnstileKhiKhoiDong } from './lib/turnstile.js';
import trackingRouter from './routes/tracking.js';
import chatRouter from './routes/chat.js';
import newsRouter from './routes/news.js';
import banDoRouter from './routes/ban-do.js';
import khieuNaiRouter from './routes/khieu-nai.js';
import thongKeRouter from './routes/thong-ke.js';
import diemDenRouter from './routes/diem-den.js';
import ttsRouter from './routes/tts.js';
import submissionsRouter from './routes/submissions.js';
import otpRouter from './routes/otp.js';
import xacMinhSdtRouter, { moTaXacMinhSdt } from './routes/xac-minh-sdt.js';
import { moTaCheDoEmail } from './lib/mailer.js';
import aiRouter from './routes/ai.js';

const app = taoApp({ ten: 'cong-khai' });
const PORT = process.env.PORT || 4000;

/* CHỈ route công khai. Không có adminRouter ở đây — đó là điểm mấu chốt.
   Cũng KHÔNG có /api/auth (BUG-045): đăng nhập cán bộ ở đây thì từ bất kỳ đâu cũng so được mật
   khẩu — và làm khoá tài khoản — cán bộ, vòng qua giới hạn IP của máy chủ cán bộ. Giao diện
   đăng nhập ở VITE_ADMIN_API_URL, cùng nơi có /api/admin; không route nào dưới đây cần phiên
   cán bộ. */
/* Cổng vào (ADR-003 việc 23) — vé xác minh cho gửi tin */
app.use('/api/cong-vao', congVaoRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/chat', chatRouter);
app.use('/api/news', newsRouter);
/* Bản đồ an ninh CÔNG KHAI cho người dân — số liệu tổng hợp, che số nhỏ. */
app.use('/api/ban-do', banDoRouter);
/* Khiếu nại mở khoá — KHÔNG cần đăng nhập, vì người bị khoá không có tài khoản. */
app.use('/api/khieu-nai', khieuNaiRouter);
/* Đếm lượt truy cập — CHỈ đếm số, không lưu dấu vết người dùng. */
app.use('/api/thong-ke', thongKeRouter);
/* Điểm đen giao thông — công khai, số liệu càng nhiều người biết càng tốt. */
app.use('/api/diem-den', diemDenRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/otp', otpRouter);
/* Mã xác minh số điện thoại qua Zalo/SMS (P86) — tắt khi chưa khai KENH_XAC_MINH_SDT */
app.use('/api/xac-minh-sdt', xacMinhSdtRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/ai', aiRouter);

ganDuoi(app, errorHandler);

async function start() {
  /* BUG-002: máy chạy thật thiếu TURNSTILE_SECRET_KEY -> NÉM LỖI, không khởi động.
     Kiểm ĐẦU TIÊN — trước việc nền, trước khi nghe cổng. development: chỉ cảnh báo. */
  const cbTurnstile = kiemKhoaTurnstileKhiKhoiDong();
  if (cbTurnstile) console.error(cbTurnstile);
  /* Dấu nối (mã máy, IP đã băm) tự xoá sau 30 ngày — không chờ ai mở trang
     nào. Bật TRƯỚC khi kiểm kết nối: CSDL chưa lên thì lượt đầu ghi lỗi, các
     chu kỳ sau tự thử lại. Xem lib/vong-doi-dau-noi.js. */
  batTuDonDauNoi(pool);
  /* Render gói miễn phí: tự gọi chính mình để không ngủ sau 15 phút vắng — chỉ khi GIU_THUC=1 (lib/giu-thuc.js). */
  batGiuThuc();
  try {
    await pool.query('SELECT 1');
    console.log('✅ [công khai] Kết nối MySQL thành công');
    await loadBannedWords(pool).catch((e) => console.warn('Không nạp được banned_words:', e.message));
  } catch (err) {
    console.error('❌ [công khai] KHÔNG kết nối được MySQL:', err.message);
  }
  app.listen(PORT, diaChiNghe(), () => {
    console.log(`🌐 Máy chủ CÔNG KHAI chạy ở cổng ${PORT}`);
    console.log(moTaCheDoEmail());
    console.log(moTaXacMinhSdt());
  });
}

/* BUG-002: start() ném lỗi (thiếu khoá bắt buộc...) -> THOÁT mã 1, tường minh — không
   trông vào cách Node xử lý unhandledRejection mặc định (cờ --unhandled-rejections=warn
   sẽ để tiến trình sống mà không phục vụ, không ai biết vì sao). */
const dungKhiLoiKhoiDong = (e) => { console.error(e?.stack || e); process.exit(1); };
start().catch(dungKhiLoiKhoiDong);
