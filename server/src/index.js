/**
 * Backend Hộp Thư Số — Điểm Chạm An Ninh (bản nâng cấp bảo mật cao).
 * Chạy: npm install && npm run dev  (cần MySQL đã import database)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { loadBannedWords } from './lib/security.js';
import { aiAvailable } from './lib/ai.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import trackingRouter from './routes/tracking.js';
import chatRouter from './routes/chat.js';
import newsRouter from './routes/news.js';
import ttsRouter from './routes/tts.js';
import submissionsRouter from './routes/submissions.js';
import otpRouter from './routes/otp.js';
import { mailMode } from './lib/mailer.js';
import { encryptionEnabled, encryptionProblem } from './lib/crypto.js';
import aiRouter from './routes/ai.js';
import adminRouter from './routes/admin/index.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1); // tin proxy (Render/Nginx) để lấy đúng IP thật

// Helmet: tự thêm các HTTP security header cho API
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // API trả JSON, không phục vụ HTML -> CSP tối giản, chặn mọi thứ
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        // Đặt TƯỜNG MINH scriptSrc và objectSrc — công cụ quét bảo mật yêu cầu
        // khai báo rõ ràng, không chấp nhận suy ra từ default-src.
        // API chỉ trả JSON nên khoá hết là đúng.
        scriptSrc: ["'none'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
      },
    },
    // Ép HTTPS 2 năm (chống hạ cấp, nghe lén)
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    // Không rò rỉ referrer
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Chống nhúng iframe
    frameguard: { action: 'deny' },
  })
);

// Permissions-Policy (helmet không đặt sẵn) — khoá quyền nhạy cảm
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  next();
});

// CORS: cho phép origin dev + origin production, kèm credentials cho cookie refresh token
const devOrigins = ['http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173'];
const envOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const allowed = [...devOrigins, ...envOrigins];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(new Error('CORS không cho phép origin này'));
    },
    credentials: true,
  })
);

/* 32mb: đủ cho một video 20MB sau khi mã hoá base64 (tăng khoảng 33%) cộng
   phần nội dung và ảnh. Trước đây 12mb nên video vừa gửi đã bị từ chối. */
app.use(express.json({ limit: '32mb' }));
app.use(cookieParser());

// Rate limit chung
app.use(rateLimit({ windowMs: 15 * 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

/* PHIÊN BẢN BACKEND — tăng số này mỗi lần có thay đổi quan trọng.
   Dùng để KIỂM TRA NHANH backend đã deploy bản mới chưa:
   mở https://<địa-chỉ-backend>/api/health trên trình duyệt.
   Thấy đúng số phiên bản mong đợi nghĩa là đã deploy. */
const BACKEND_VERSION = 'v8-2026-07';

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    version: BACKEND_VERSION,
    ai: aiAvailable(),
    // false = ĐANG CÓ SỰ CỐ: hệ thống từ chối nhận ý kiến có danh tính
    encryption: encryptionEnabled(),
    // Liệt kê các chức năng mới — nhìn là biết bản này có gì
    features: ['quyen-xoa-du-lieu', 'loc-muc-khan-cap', 'viec-can-gap'],
    time: new Date().toISOString(),
  })
);

/* ===== CHẨN ĐOÁN CƠ SỞ DỮ LIỆU =====
   Mở https://<backend>/api/health/schema trên trình duyệt để biết CHÍNH XÁC
   backend đang kết nối database nào và thiếu bảng/cột gì.
   Sinh ra vì đã mất nhiều lượt đoán mò: SQL chạy một database, backend đọc
   database khác — nhìn từ ngoài không thể biết. */
app.get('/api/health/schema', async (_req, res) => {
  const { pool } = await import('./db.js');
  try {
    const [[db]] = await pool.query('SELECT DATABASE() AS ten');

    // Những thứ hệ thống BẮT BUỘC phải có
    const canCo = [
      ['submissions', 'identity_erased'],
      ['submissions', 'identity_erased_at'],
      ['submissions', 'deleted_at'],
      ['submissions', 'urgency'],
      ['data_deletion_requests', 'requester_ip'],
      ['data_deletion_requests', 'handled_at'],
      ['data_deletion_requests', 'handled_by'],
      ['data_deletion_requests', 'reason'],
    ];

    const ketQua = [];
    for (const [bang, cot] of canCo) {
      const [[r]] = await pool.query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [bang, cot]
      );
      ketQua.push({ bang, cot, co: r.n > 0 });
    }

    const thieu = ketQua.filter((x) => !x.co);

    // Liệt kê các database khác trên cùng máy chủ, giúp phát hiện chạy nhầm chỗ
    let cacDatabase = [];
    try {
      const [rows] = await pool.query(
        `SELECT SCHEMA_NAME AS ten FROM information_schema.SCHEMATA
         WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys')`
      );
      cacDatabase = rows.map((r) => r.ten);
    } catch { /* không đủ quyền -> bỏ qua */ }

    res.json({
      backend_dang_ket_noi_database: db.ten,
      cac_database_tren_may_chu: cacDatabase,
      day_du: thieu.length === 0,
      thieu: thieu.map((x) => `${x.bang}.${x.cot}`),
      chi_tiet: ketQua,
      huong_dan: thieu.length === 0
        ? 'Cơ sở dữ liệu đầy đủ. Nếu vẫn lỗi thì nguyên nhân khác.'
        : `Hãy mở HeidiSQL, CHỌN database "${db.ten}" rồi chạy nang_cap_v8.sql`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Không kiểm tra được', chi_tiet: err.message });
  }
});

// Public API
app.use('/api/auth', authRouter);
app.use('/api/tracking', trackingRouter);
/* Kênh trao đổi hai chiều với người gửi ý kiến (vào bằng mã tra cứu + PIN) */
app.use('/api/chat', chatRouter);
app.use('/api/news', newsRouter);
/* Đọc tiếng Việt qua máy chủ — cho máy người dùng không cài giọng Việt */
app.use('/api/tts', ttsRouter);
app.use('/api/otp', otpRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/ai', aiRouter);

// Admin API (bên trong tự yêu cầu đăng nhập + phân quyền)
app.use('/api/admin', adminRouter);

app.use((_req, res) => res.status(404).json({ error: 'Endpoint không tồn tại.' }));
app.use(errorHandler);

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Kết nối MySQL thành công');
    await loadBannedWords(pool).catch((e) => console.warn('Không nạp được banned_words:', e.message));
  } catch (err) {
    console.error('❌ KHÔNG kết nối được MySQL:', err.message);
    console.error('   → Kiểm tra MySQL đã chạy chưa và thông tin trong server/.env');
  }
  app.listen(PORT, () => {
  console.log('🤖 Phân tích ý kiến: ' + (process.env.GEMINI_MODEL || 'gemini-2.5-flash'));
  console.log('💬 Chatbox AI:       ' + (process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash'));
  const mm = mailMode();
  console.log(
    mm === 'brevo'  ? '📧 Email OTP: Brevo (gửi được tới BẤT KỲ email)'
  : mm === 'resend' ? '📧 Email OTP: Resend (⚠️ chưa có tên miền -> chỉ gửi tới email của chính bạn)'
  : mm === 'gmail'  ? '📧 Email OTP: Gmail SMTP (⚠️ Render hay chặn cổng SMTP)'
  :                   '📧 Email OTP: CHẾ ĐỘ DEMO (hiện mã trên màn hình)');
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    console.log(`   AI (Gemini): ${aiAvailable() ? 'ĐÃ BẬT' : 'chưa cấu hình key'}`);
    if (encryptionEnabled()) {
      console.log('🔒 Mã hoá danh tính: ĐÃ BẬT (AES-256-GCM)');
    } else {
      console.error('');
      console.error('🔴🔴🔴 MÃ HOÁ DANH TÍNH KHÔNG HOẠT ĐỘNG 🔴🔴🔴');
      console.error('   Lý do: ' + encryptionProblem());
      console.error('   Hệ thống VẪN CHẠY nhưng TỪ CHỐI mọi ý kiến có danh tính.');
      console.error('   Tố giác ẩn danh không bị ảnh hưởng.');
      console.error('');
    }
  });
}

/* Không tự chạy khi đang chạy test: nạp module này sẽ MỞ CỔNG và KẾT NỐI MySQL,
   trong khi bộ test phải chạy được trên máy không có MySQL. Test nạp file để
   kiểm tra toàn bộ router liên kết được (đúng loại lỗi đã làm chết backend:
   routes/ai.js import một export không tồn tại -> SyntaxError lúc khởi động). */
if (process.env.NODE_ENV !== 'test') start();

export default app;
