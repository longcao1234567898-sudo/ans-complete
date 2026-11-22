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
import jwt from 'jsonwebtoken';
import { gioiHanChung } from './lib/gioi-han-chung.js';
import { khoaIp } from './lib/helpers.js';
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

/** Loopback: app chỉ nghe ở chính máy mình, không ai nối thẳng từ ngoài vào được. */
function laDiaChiNoiBo(h) {
  const s = String(h ?? '').trim().toLowerCase();
  return s === 'localhost' || s === '::1' || s === '::ffff:127.0.0.1'
    || /^127(\.\d{1,3}){3}$/.test(s);
}

/**
 * CẢNH BÁO KHỞI ĐỘNG: bật chặn IP cán bộ mà app KHÔNG nghe localhost (BUG-047).
 *
 * Chặn IP cán bộ (chanTheoIp) tin vào req.ip qua `trust proxy 1` — chỉ ĐÚNG khi
 * app nằm sau Nginx và KHÔNG nối thẳng từ ngoài được. RA-SOAT P113 chứng minh:
 * nối THẲNG vào cổng app kèm X-Forwarded-For giả thì lách được chặn IP (qua Nginx
 * thì spoof thất bại). Khi HOST để trống (nghe mọi giao diện) hoặc là một IP công
 * khai, an toàn chỉ còn dựa vào tường lửa chặn cổng app — lớp ngoài tầm mã nguồn.
 *
 * KHÔNG từ chối khởi động (khác JWT_SECRET): có topology hợp lệ dùng HOST là IP
 * nội bộ sau tường lửa (vd Nginx ở máy khác). Chặn cứng sẽ gãy các topology đó.
 * Nhưng phải BÁO TO để người vận hành kiểm tường lửa hoặc đặt HOST=127.0.0.1.
 *
 * Trả chuỗi cảnh báo, hoặc null khi không có gì đáng lo (chưa bật chặn IP, hoặc
 * app nghe localhost).
 */
export function canhBaoChanIpKhongAnToan() {
  const dsIp = (process.env.ADMIN_ALLOWED_IPS || '').trim();
  if (!dsIp) return null;                        // chưa bật chặn IP -> không có gì để lách
  if (laDiaChiNoiBo(process.env.HOST)) return null;  // nghe localhost -> không nối thẳng được
  const host = String(process.env.HOST ?? '').trim();
  return '🔴 CHẶN IP CÁN BỘ CÓ THỂ BỊ LÁCH: đã khai ADMIN_ALLOWED_IPS nhưng HOST '
    + (host ? `="${host}"` : 'để trống (app nghe MỌI giao diện)')
    + ' — không phải localhost. Kẻ nối THẲNG vào cổng app kèm X-Forwarded-For giả sẽ '
    + 'lách được chặn IP (BUG-047). Đặt HOST=127.0.0.1 để app chỉ nghe sau Nginx, và '
    + 'bảo đảm tường lửa chặn cổng app từ bên ngoài.';
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
  /* Nguồn dev (localhost) CHỈ khi máy khai tường minh development/test (BUG-053): trước đây
     luôn có, kèm credentials — trang bất kỳ chạy ở localhost trên máy cán bộ thành nguồn được
     tin của máy chủ thật. Không dựa vào "khác production": Render không đặt NODE_ENV. */
  const mayCaNhan = ['development', 'test'].includes(process.env.NODE_ENV || '');
  const devOrigins = mayCaNhan ? ['http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173'] : [];
  const envOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = [...envOrigins, ...corsThem, ...devOrigins];
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowed.includes(origin)) return cb(null, true);
        cb(new Error('CORS không cho phép origin này'));
      },
      credentials: true,
    })
  );

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

/* ĐỌC THÂN YÊU CẦU — gọi SAU taoApp (đã có giới hạn lượt chung), SAU chặn IP nếu có, TRƯỚC
   mọi route (BUG-048). Trước đây đọc thân nằm trong taoApp, đứng trước cả giới hạn lượt lẫn
   chặn IP cán bộ, với 32 MB cho mọi đường: IP đã bị 429 hay ngoài dải cơ quan vẫn được đọc
   trọn 32 MB và JSON.parse vào bộ nhớ rồi mới bị từ chối — vài chục yêu cầu song song là máy
   4 GB tràn bộ nhớ, kênh tiếp nhận ngừng.

   32 MB: đủ cho một video 20 MB sau khi mã hoá base64 (tăng khoảng 33%) cộng nội dung và ảnh.
   CHỈ hai đường nhận tệp của người dân cần: POST /api/submissions và POST /api/chat/bo-sung.
   Allow-list (luật 5): so đúng đường đã chuẩn hoá chữ thường, bỏ "/" cuối; cách viết lạ khác
   rơi về giới hạn nhỏ — phía an toàn. Mọi đường khác 1 MB: nội dung chữ dài nhất (tin tức,
   lịch sử trò chuyện với trợ lý) còn cách xa mức đó. */
export const GIOI_HAN_GOI_LON = '32mb';
export const GIOI_HAN_GOI_THUONG = '1mb';
const DUONG_GOI_LON = new Set(['/api/submissions', '/api/chat/bo-sung']);

/* Đường KHÔNG đọc thân: POST /api/ai/moderate-image luôn trả blocked:false và không dùng thân
   (routes/ai.js). Giao diện vẫn gửi data URL ảnh; giới hạn 1 MB làm ảnh lớn nhận 413, giao diện rơi
   xuống phép đo màu da và có thể chặn oan ảnh (hồi quy do BUG-048, RETEST phát hiện). Không đọc gì
   thì không 413 và không tốn bộ nhớ; Node tự bỏ phần thân chưa đọc. */
const DUONG_KHONG_DOC_THAN = new Set(['/api/ai/moderate-image']);

export function laDuongGoiLon(req) {
  if (req.method !== 'POST') return false;
  const duong = String(req.path || '').toLowerCase().replace(/\/+$/, '');
  return DUONG_GOI_LON.has(duong);
}

/* GÓI LỚN = khai dài quá giới hạn thường, hoặc gửi kiểu chunked (không khai độ dài). Gói khai
   ≤ 1 MB thì bộ đọc chỉ đọc đúng chừng đó byte — không cần đếm. */
const BYTE_GOI_THUONG = 1024 * 1024;
function laGoiLon(req) {
  if (req.headers['transfer-encoding']) return true;
  const dai = Number(req.headers['content-length']);
  return !Number.isFinite(dai) || dai > BYTE_GOI_THUONG;
}

/* GIỚI HẠN SỐ GÓI LỚN ĐANG ĐỌC CÙNG LÚC (BUG-048 lần 2). Giới hạn lượt chung đếm LƯỢT, không đếm
   yêu cầu ĐANG CHẠY: 30 yêu cầu × 30 MB gửi song song lọt hết, bộ nhớ tiến trình lên 2,8 GB (RETEST
   đo). Mỗi gói lớn giữ chừng 90 MB lúc đọc và xử lý; 6 cùng lúc ~ 0,5 GB — máy 4 GB chịu được.
   Giữ chỗ tới khi phản hồi xong HOẶC kết nối đứt (huỷ giữa chừng phải trả chỗ, không thì kẹt vĩnh
   viễn). 503 + Retry-After: hàng chờ gửi ngầm của giao diện (ADR-008) tự gửi lại, ý kiến không mất. */
export const GOI_LON_MOI_MANG = 2;
export const GOI_LON_TOAN_MAY = 6;
function taoGioiHanGoiLon() {
  const theoMang = new Map();
  let tong = 0;
  return (req, res, next) => {
    const k = khoaIp(req);
    const dang = theoMang.get(k) || 0;
    if (dang >= GOI_LON_MOI_MANG || tong >= GOI_LON_TOAN_MAY) {
      res.set('Retry-After', '10');
      return res.status(503).json({
        error: 'Máy chủ đang nhận nhiều tệp cùng lúc. Bà con chờ vài giây rồi gửi lại — '
          + 'nội dung chưa bị mất. Việc khẩn cấp xin gọi ngay 113.',
      });
    }
    theoMang.set(k, dang + 1);
    tong += 1;
    let daTra = false;
    const traCho = () => {
      if (daTra) return;
      daTra = true;
      tong -= 1;
      const con = (theoMang.get(k) || 1) - 1;
      if (con <= 0) theoMang.delete(k); else theoMang.set(k, con);
    };
    res.on('finish', traCho);
    res.on('close', traCho);
    return next();
  };
}

/* /api/chat/bo-sung đòi vé phòng trao đổi ở header — kiểm TRƯỚC khi đọc gói lớn: không vé thì
   không tốn bộ nhớ đọc 32 MB (BUG-048 lần 2). Chỉ là lớp chặn sớm; route vẫn tự kiểm vé đầy đủ. */
function coVeChatHopLe(req) {
  const ve = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  /* Đọc khoá lúc kiểm, không nạp lib/token.js ở đầu tệp (mọi điểm vào dùng nen-tang). Thiếu
     khoá -> coi như không vé (từ chối), máy thật thì đã không khởi động được (luật 1). */
  const khoa = String(process.env.JWT_SECRET || '').trim();
  if (!ve || !khoa) return false;
  try {
    return jwt.verify(ve, khoa, { algorithms: ['HS256'] }).purpose === 'chat_reporter';
  } catch {
    return false;
  }
}

export function ganDocThan(app) {
  const docLon = express.json({ limit: GIOI_HAN_GOI_LON });
  const docThuong = express.json({ limit: GIOI_HAN_GOI_THUONG });
  const gioiHanGoiLon = taoGioiHanGoiLon();
  app.use((req, res, next) => {
    if (req.method === 'POST'
        && DUONG_KHONG_DOC_THAN.has(String(req.path || '').toLowerCase().replace(/\/+$/, ''))) {
      return next();
    }
    if (!laDuongGoiLon(req)) return docThuong(req, res, next);
    if (!laGoiLon(req)) return docLon(req, res, next);
    const duong = String(req.path || '').toLowerCase().replace(/\/+$/, '');
    if (duong === '/api/chat/bo-sung' && !coVeChatHopLe(req)) {
      return res.status(401).json({ error: 'Bà con vào lại bằng mã tra cứu và mã PIN để bổ sung thông tin.' });
    }
    return gioiHanGoiLon(req, res, () => docLon(req, res, next));
  });
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
