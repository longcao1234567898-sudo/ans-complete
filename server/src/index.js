/**
 * Backend Hộp Thư An Ninh Số (bản nâng cấp bảo mật cao).
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
import newsRouter from './routes/news.js';
import submissionsRouter from './routes/submissions.js';
import otpRouter from './routes/otp.js';
import { mailMode } from './lib/mailer.js';
import aiRouter from './routes/ai.js';
import adminRouter from './routes/admin/index.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1); // tin proxy (Render/Nginx) để lấy đúng IP thật

// Helmet: tự thêm các HTTP security header
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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

app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());

// Rate limit chung
app.use(rateLimit({ windowMs: 15 * 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: aiAvailable() }));

// Public API
app.use('/api/auth', authRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/news', newsRouter);
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
  console.log('🤖 Model AI: ' + (process.env.GEMINI_MODEL || 'gemini-2.5-pro'));
  const mm = mailMode();
  console.log(
    mm === 'brevo'  ? '📧 Email OTP: Brevo (gửi được tới BẤT KỲ email)'
  : mm === 'resend' ? '📧 Email OTP: Resend (⚠️ chưa có tên miền -> chỉ gửi tới email của chính bạn)'
  : mm === 'gmail'  ? '📧 Email OTP: Gmail SMTP (⚠️ Render hay chặn cổng SMTP)'
  :                   '📧 Email OTP: CHẾ ĐỘ DEMO (hiện mã trên màn hình)');
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    console.log(`   AI (Gemini): ${aiAvailable() ? 'ĐÃ BẬT' : 'chưa cấu hình key'}`);
  });
}

start();
