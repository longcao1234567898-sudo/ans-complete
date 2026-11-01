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
import { gioiHanChung } from './lib/gioi-han-chung.js';
import { aiAvailable } from './lib/ai.js';
import { encryptionEnabled } from './lib/crypto.js';
import { taoKiemKho } from './lib/kiem-kho.js';
import { pool } from './db.js';

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
/**
 * Địa chỉ máy chủ nghe (biến HOST — ND-083). Đứng sau Nginx cùng máy (Viettel, B7) thì
 * ghi HOST=127.0.0.1: cổng 4000/4001 không bao giờ nhận kết nối từ ngoài máy, kể cả khi
 * tường lửa B4 / Security Group bị cấu hình sai. Vì `trust proxy 1` tin chặng ngay
 * trước làm proxy: ai gọi THẲNG được cổng thì tự đặt X-Forwarded-For lách mọi lớp chặn
 * theo IP (đã thử P96: lọt ADMIN_ALLOWED_IPS). Để trống = như cũ, nghe mọi địa chỉ
 * (Render bắt buộc). Giá trị lạ -> NÉM LỖI, không khởi động (luật 1, allow-list luật 5).
 */
const DANG_IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const DANG_IPV6 = /^[0-9a-f:]+$/i;
export function diaChiNghe() {
  const h = process.env.HOST ?? '';
  if (h === '') return undefined;
  if (h === 'localhost' || DANG_IPV4.test(h) || (h.includes(':') && DANG_IPV6.test(h))) return h;
  throw new Error(`HOST="${h}" không hợp lệ — ghi một địa chỉ IP (vd 127.0.0.1) hoặc để trống`);
}

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

  /* 32mb: đủ cho một video 20MB sau khi mã hoá base64 (tăng khoảng 33%) cộng
   phần nội dung và ảnh. Trước đây 12mb nên video vừa gửi đã bị từ chối. */
app.use(express.json({ limit: '32mb' }));
  /* BÁO LỖI RÕ KHI GÓI DỮ LIỆU QUÁ LỚN.

   ⚠️ Không có khối này thì gói vượt giới hạn bị từ chối với một lỗi khó hiểu,
   trình duyệt chỉ thấy "lỗi mạng" — bà con bấm gửi mà không biết vì sao không
   được, cứ bấm đi bấm lại. Đã xảy ra thật khi đính video lớn lúc chưa cấu hình
   kho ảnh: gói phình quá 32MB và cả ý kiến bị mất theo.

   Nay nói thẳng nguyên nhân và cách làm tiếp. */
app.use((err, _req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      error: 'Tệp đính kèm quá lớn nên không gửi được. Bà con thử bỏ video hoặc '
           + 'quay đoạn ngắn hơn, rồi gửi lại.',
    });
  }
  return next(err);
});

app.use(cookieParser());
  // Giới hạn chung: XEM 1.500 / GỬI 300 mỗi 15 phút mỗi IP, đếm riêng (lib/gioi-han-chung.js, ND-063)
  app.use(...gioiHanChung());

  // Health check — mỗi máy chủ tự khai tên để phân biệt khi tách
  /* ND-084: mã luôn 200 (tiến trình sống — Render dựa vào đây); kho chết thì ok:false, db:false
     để công cụ theo dõi và giao diện (kiemTraMayChu -> trang dự phòng 113) biết */
  const kiemKho = taoKiemKho(pool);
  app.get('/api/health', async (_req, res) => {
    const db = await kiemKho();
    res.json({
      ok: db,
      db,
      version: BACKEND_VERSION,
      may_chu: ten,
      ai: aiAvailable(),
      encryption: encryptionEnabled(),
      time: new Date().toISOString(),
    });
  });

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
/**
 * Giới hạn IP CHỈ cho phần cán bộ (/api/auth, /api/admin) — dùng ở bản chạy gộp
 * index.js, nơi phần công dân chạy chung một máy chủ (ND-086). Gắn bằng app.use(...)
 * không đường dẫn để /api/admin vẫn mount đúng dạng app.use('/api/admin', adminRouter)
 * (test BUG-001 (d): mọi máy chủ dùng chung một lớp xác thực).
 */
export function chanTheoIpPhanCanBo(layIpThat) {
  /* Để CHÍNH Express khớp đường dẫn (RETEST P104): Express mặc định không phân biệt hoa thường,
     /API/ADMIN vẫn vào adminRouter — tự so chuỗi bằng biểu thức chữ thường thì để lọt. Router
     mới mặc định không phân biệt hoa thường nên khớp ít nhất mọi đường mà app khớp (app có bật
     phân biệt hoa thường thì lớp này chặn RỘNG hơn — phía an toàn). */
  const lop = express.Router();
  lop.use(['/api/auth', '/api/admin'], chanTheoIp(layIpThat));
  return lop;
}

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
