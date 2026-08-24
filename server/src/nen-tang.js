/**
 * NỀN TẢNG CHUNG CHO MÁY CHỦ — dùng lại cho cả ba điểm vào.
 * ============================================================================
 *
 * Vì sao có tệp này: hệ thống có thể chạy theo hai kiểu.
 *
 *   1. MỘT máy chủ gộp cả công khai lẫn cán bộ (index.js) — dùng khi demo và
 *      khi hạ tầng còn hạn chế (một dịch vụ Render duy nhất, đỡ tốn).
 *
 *   2. HAI máy chủ tách riêng (may-chu-cong-khai.js + may-chu-can-bo.js) — dùng
 *      khi bàn giao: máy chủ cán bộ đưa vào mạng nội bộ, máy chủ công khai vẫn
 *      ngoài Internet cho dân gửi ý kiến.
 *
 * Cả ba đều cần y hệt phần khung: tạo app, gắn Helmet, CORS, rate limit, health
 * check. Gom vào đây một lần để ba điểm vào không chép đi chép lại — sửa bảo
 * mật một chỗ là cả ba được. Mỗi điểm vào chỉ khác nhau ở chỗ GẮN ROUTE NÀO.
 * ============================================================================
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { aiAvailable } from './lib/ai.js';
import { encryptionEnabled } from './lib/crypto.js';

const BACKEND_VERSION = 'v9-2026-08';

/**
 * Tạo một app Express đã gắn sẵn toàn bộ middleware bảo mật chung.
 *
 * @param {object} opts
 * @param {string} opts.ten - tên máy chủ để hiện ở /api/health (vd 'cong-khai')
 * @param {string[]} opts.corsThem - danh sách origin cho phép THÊM, ngoài
 *        danh sách chung từ biến CORS_ORIGIN. Máy chủ cán bộ dùng để chỉ cho
 *        đúng origin trang cán bộ, tách khỏi origin trang công khai.
 */
export function taoApp({ ten = 'gop', corsThem = [] } = {}) {
  const app = express();

  app.set('trust proxy', 1); // tin proxy (Render/Nginx) để lấy đúng IP thật

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    })
  );

  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    next();
  });

  /* CORS: origin dev + origin từ biến môi trường + origin thêm riêng cho điểm
     vào này. Mọi địa chỉ đọc từ BIẾN, không viết cứng — để lúc bàn giao chỉ
     đổi biến, không sửa mã. */
  const devOrigins = ['http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173'];
  const envOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = [...devOrigins, ...envOrigins, ...corsThem];
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
  app.use(rateLimit({ windowMs: 15 * 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

  // Health check — mỗi máy chủ tự khai tên để phân biệt khi tách
  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      version: BACKEND_VERSION,
      may_chu: ten,
      ai: aiAvailable(),
      encryption: encryptionEnabled(),
      time: new Date().toISOString(),
    })
  );

  return app;
}

/** Gắn phần đuôi chung (404 + xử lý lỗi) — gọi SAU khi đã gắn hết route. */
export function ganDuoi(app, errorHandler) {
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint không tồn tại.' }));
  app.use(errorHandler);
}

/**
 * MIDDLEWARE GIỚI HẠN IP CHO MÁY CHỦ CÁN BỘ.
 *
 * Chỉ cho phép truy cập từ dải IP khai trong biến ADMIN_ALLOWED_IPS (các IP
 * cách nhau bằng dấu phẩy). Để TRỐNG biến này thì KHÔNG chặn ai — đúng cho lúc
 * demo. Khi đơn vị đưa vào nội bộ và có IP tĩnh thì khai IP cơ quan vào, cửa
 * cán bộ tự động chỉ mở cho người trong cơ quan.
 *
 * Đặt ở tầng ngoài cùng của máy chủ cán bộ, trước cả đăng nhập — người ngoài
 * dải IP bị chặn ngay, chưa cần tới bước nhập mật khẩu.
 */
export function chanTheoIp(layIpThat) {
  const dsIp = (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  return (req, res, next) => {
    if (dsIp.length === 0) return next(); // chưa cấu hình -> không chặn (demo)
    const ip = layIpThat(req);
    if (dsIp.includes(ip)) return next();
    console.warn(`[chặn IP] từ chối ${ip} — không thuộc dải IP cơ quan`);
    return res.status(403).json({ error: 'Trang cán bộ chỉ truy cập được từ mạng cơ quan.' });
  };
}
