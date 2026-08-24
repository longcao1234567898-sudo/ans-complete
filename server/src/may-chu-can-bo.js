/**
 * MÁY CHỦ CÁN BỘ — chỉ phục vụ cán bộ xử lý.
 * ============================================================================
 *
 * Dùng khi BÀN GIAO. Đây là máy chủ đưa vào MẠNG NỘI BỘ của cơ quan: chứa toàn
 * bộ chức năng quản trị (duyệt hồ sơ, xem danh tính, thống kê, xuất dữ liệu).
 * Không lộ ra Internet — chỉ mạng nội bộ hoặc dải IP cơ quan chạm tới được.
 *
 * Chạy:  node src/may-chu-can-bo.js
 * Cổng:  ADMIN_PORT (mặc định 4001) — khác cổng máy chủ công khai để chạy song
 *        song trên cùng một máy nếu cần.
 *
 * HAI LỚP BẢO VỆ ĐƯỜNG VÀO:
 *   1. Giới hạn IP (chanTheoIp) — chặn ngay ở cửa nếu không thuộc dải IP cơ
 *      quan. Bật bằng cách khai biến ADMIN_ALLOWED_IPS. Để trống thì không chặn
 *      (lúc demo). Khi vào nội bộ có IP tĩnh thì khai vào.
 *   2. Đăng nhập + phân quyền — nằm sẵn trong adminRouter (requireAuth).
 *
 * Lúc DEMO không cần chạy tệp này — index.js gộp đã có sẵn phần cán bộ.
 * ============================================================================
 */
import 'dotenv/config';
import { pool } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { layIpThat } from './lib/helpers.js';
import { taoApp, ganDuoi, chanTheoIp } from './nen-tang.js';

import adminRouter from './routes/admin/index.js';
/* Máy chủ cán bộ vẫn cần route đăng nhập để cán bộ lấy phiên. */
import authRouter from './routes/auth.js';

/* CORS: chỉ cho origin của TRANG CÁN BỘ, khai riêng qua biến ADMIN_CORS_ORIGIN
   — tách khỏi origin trang công khai. Trang cán bộ khi vào nội bộ sẽ có địa chỉ
   riêng (vd http://10.0.0.5 trong LAN), khai vào biến này. */
const adminOrigins = (process.env.ADMIN_CORS_ORIGIN || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const app = taoApp({ ten: 'can-bo', corsThem: adminOrigins });
const PORT = process.env.ADMIN_PORT || 4001;

/* LỚP 1: giới hạn IP — áp cho TẤT CẢ route của máy chủ này, kể cả đăng nhập. */
app.use(chanTheoIp(layIpThat));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

ganDuoi(app, errorHandler);

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ [cán bộ] Kết nối MySQL thành công');
  } catch (err) {
    console.error('❌ [cán bộ] KHÔNG kết nối được MySQL:', err.message);
  }
  const dsIp = (process.env.ADMIN_ALLOWED_IPS || '').trim();
  console.log(dsIp
    ? `🔒 Giới hạn IP: BẬT (chỉ cho ${dsIp})`
    : '🔓 Giới hạn IP: TẮT (chưa khai ADMIN_ALLOWED_IPS — dùng cho demo)');
  app.listen(PORT, () => console.log(`🏢 Máy chủ CÁN BỘ chạy ở cổng ${PORT}`));
}
start();
