/**
 * KHIẾU NẠI MỞ KHOÁ — cho người bị khoá nhầm.
 * ============================================================================
 *
 * VÌ SAO CẦN: hệ thống tự khoá thiết bị hoặc địa chỉ mạng khi phát hiện gửi tin
 * rác. Nhưng máy khoá nhầm là chuyện có thật:
 *   - Bà con dùng chung máy ở tiệm net, ở nhà văn hoá
 *   - Mạng di động Việt Nam cấp phát chung địa chỉ cho rất nhiều thuê bao, một
 *     người phá là cả vùng chịu chung
 *   - Cán bộ đánh nhầm một tin thật thành tin rác
 *
 * Không có đường khiếu nại thì người bị oan mất hẳn kênh báo tin cho công an mà
 * không hiểu vì sao, cũng không biết kêu ai. Đó là hỏng đúng mục đích của cả hệ
 * thống — nhận tin của dân.
 *
 * ⚠️ KHÔNG cần đăng nhập (người bị khoá thì làm gì có tài khoản).
 * ⚠️ GIỚI HẠN 2 LẦN mỗi thiết bị/địa chỉ, nếu không chính kẻ phá lại dùng
 *    khiếu nại để quấy cán bộ.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { layIpThat } from '../lib/helpers.js';
import { sanitizeText } from '../lib/security.js';

const router = Router();

/** Số lần tối đa một thiết bị/địa chỉ được khiếu nại. */
const SO_LAN_TOI_DA = 2;

/* Giới hạn tần suất ở tầng mạng — lớp chặn thứ nhất, trước cả khi đếm số lần
   trong database. Chặn kiểu gửi liên tục làm nghẽn. */
const gioiHan = rateLimit({
  windowMs: 10 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => layIpThat(req),
  message: { error: 'Bà con gửi hơi nhanh. Thử lại sau ít phút.' },
});

/** GET /api/khieu-nai/trang-thai — máy đang bị khoá không, đã khiếu nại mấy lần
 *
 * Giao diện gọi trước để biết có nên hiện nút khiếu nại hay không, và người dân
 * đã dùng hết lượt chưa. */
router.get('/trang-thai', gioiHan, async (req, res) => {
  const deviceId = String(req.query.deviceId || '').trim().slice(0, 64);
  const ip = layIpThat(req);

  try {
    /* Đang bị khoá vì cái gì? Có thể bị khoá thiết bị, khoá địa chỉ, hoặc cả hai. */
    const [khoa] = await pool.query(
      `SELECT kind, identifier, reason, expires_at FROM blacklists
        WHERE expires_at > NOW()
          AND kind IN ('device','ip')
          AND ((kind = 'device' AND identifier = ?) OR (kind = 'ip' AND identifier = ?))`,
      [deviceId || null, ip]
    );

    if (khoa.length === 0) {
      return res.json({ biKhoa: false, coTheKhieuNai: false, soLanDaGui: 0, soLanToiDa: SO_LAN_TOI_DA });
    }

    /* Đếm số lần đã khiếu nại cho CÁC đối tượng đang khoá này. */
    const dsDinhDanh = khoa.map((k) => k.identifier);
    const [[dem]] = await pool.query(
      `SELECT COUNT(*) AS n FROM unlock_appeals
        WHERE identifier IN (?) OR (device_id IS NOT NULL AND device_id = ?)`,
      [dsDinhDanh, deviceId || null]
    );
    const soLanDaGui = Number(dem?.n || 0);

    /* Có khiếu nại nào đang chờ xử lý không — để không cho gửi trùng. */
    const [[cho]] = await pool.query(
      `SELECT COUNT(*) AS n FROM unlock_appeals
        WHERE status = 'cho_xu_ly' AND identifier IN (?)`,
      [dsDinhDanh]
    );

    res.json({
      biKhoa: true,
      lyDo: khoa[0].reason || null,
      loaiKhoa: khoa.map((k) => k.kind),
      dangChoXuLy: Number(cho?.n || 0) > 0,
      soLanDaGui,
      soLanToiDa: SO_LAN_TOI_DA,
      coTheKhieuNai: soLanDaGui < SO_LAN_TOI_DA && Number(cho?.n || 0) === 0,
    });
  } catch (err) {
    /* Bảng chưa tạo (chưa chạy nang_cap_v17.sql) -> báo không khiếu nại được,
       KHÔNG làm hỏng trang. */
    console.warn('[khiếu nại] không đọc được trạng thái:', err.message);
    res.json({ biKhoa: false, coTheKhieuNai: false, soLanDaGui: 0, soLanToiDa: SO_LAN_TOI_DA });
  }
});

/** POST /api/khieu-nai — gửi khiếu nại mở khoá */
router.post('/', gioiHan, async (req, res) => {
  const deviceId = String(req.body?.deviceId || '').trim().slice(0, 64);
  const noiDungTho = String(req.body?.noiDung || '');
  const ip = layIpThat(req);

  /* Làm sạch nội dung như mọi đầu vào khác — khiếu nại cũng hiện lên màn hình
     cán bộ nên vẫn phải chống mã độc chèn vào. */
  const noiDung = sanitizeText(noiDungTho).slice(0, 1000);
  if (noiDung.trim().length < 10) {
    return res.status(400).json({ error: 'Bà con vui lòng trình bày rõ hơn (ít nhất 10 chữ).' });
  }

  try {
    const [khoa] = await pool.query(
      `SELECT kind, identifier FROM blacklists
        WHERE expires_at > NOW()
          AND kind IN ('device','ip')
          AND ((kind = 'device' AND identifier = ?) OR (kind = 'ip' AND identifier = ?))`,
      [deviceId || null, ip]
    );

    if (khoa.length === 0) {
      return res.status(400).json({ error: 'Máy của bà con không bị khoá, không cần khiếu nại.' });
    }

    const dsDinhDanh = khoa.map((k) => k.identifier);
    const [[dem]] = await pool.query(
      `SELECT COUNT(*) AS n FROM unlock_appeals
        WHERE identifier IN (?) OR (device_id IS NOT NULL AND device_id = ?)`,
      [dsDinhDanh, deviceId || null]
    );
    if (Number(dem?.n || 0) >= SO_LAN_TOI_DA) {
      return res.status(429).json({
        error: `Bà con đã khiếu nại đủ ${SO_LAN_TOI_DA} lần. Vui lòng liên hệ trực tiếp trụ sở công an.`,
      });
    }

    const [[cho]] = await pool.query(
      `SELECT COUNT(*) AS n FROM unlock_appeals
        WHERE status = 'cho_xu_ly' AND identifier IN (?)`,
      [dsDinhDanh]
    );
    if (Number(cho?.n || 0) > 0) {
      return res.status(409).json({ error: 'Khiếu nại trước của bà con đang được xem xét, vui lòng chờ.' });
    }

    /* Ghi khiếu nại cho TỪNG đối tượng đang khoá. Bị khoá cả thiết bị lẫn địa
       chỉ thì gỡ một cái vẫn chưa vào được, nên cán bộ phải thấy đủ. */
    for (const k of khoa) {
      await pool.query(
        `INSERT INTO unlock_appeals (identifier, kind, content, device_id, ip_address)
         VALUES (?,?,?,?,?)`,
        [k.identifier, k.kind, noiDung, deviceId || null, ip]
      );
    }

    res.status(201).json({
      ok: true,
      message: 'Đã gửi khiếu nại. Cán bộ sẽ xem xét và phản hồi.',
    });
  } catch (err) {
    console.error('[khiếu nại] lỗi:', err.message);
    res.status(500).json({ error: 'Chưa gửi được lúc này. Đã chạy nang_cap_v17.sql chưa?' });
  }
});

export default router;
