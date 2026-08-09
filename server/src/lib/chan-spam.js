/**
 * CHẶN SPAM THEO THIẾT BỊ — kèm cơ chế CHẶN NGẦM (shadow ban)
 * ============================================================================
 *
 * VÌ SAO KHÔNG KHOÁ THEO ĐỊA CHỈ IP:
 * Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm, có khi hàng nghìn thuê bao
 * cùng ra Internet bằng MỘT địa chỉ IP công cộng. Khoá IP là khoá oan cả vùng
 * thuê bao. Bà con ở quê phần lớn vào bằng 4G — đúng nhóm bị chặn oan nhiều
 * nhất, mà cũng đúng nhóm cần kênh tố giác nhất.
 *
 * Hệ thống này đã dính đúng bài học đó một lần: mã xác thực ẩn danh từng bị
 * huỷ theo IP, khiến người này xin mã thì mã của người kia mất hiệu lực.
 *
 * Nên khoá theo MÃ THIẾT BỊ do trình duyệt tự sinh, lưu trong máy người dùng.
 * IP chỉ là lớp dự phòng, và chỉ kích hoạt khi có bằng chứng rõ ràng.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CHẶN NGẦM CHỨ KHÔNG BÁO THẲNG:
 * Báo thẳng "bạn đã bị khoá" là mách nước cho kẻ phá hoại. Họ biết ngay mà
 * xoá bộ nhớ trình duyệt, đổi máy, đổi mạng — vòng lặp không hồi kết.
 *
 * Chặn ngầm thì họ vẫn thấy "Gửi thành công", vẫn nhận mã tra cứu, tưởng mọi
 * thứ bình thường. Đơn được lưu nhưng đánh dấu is_spam = 1, không vào hàng chờ
 * của cán bộ. Họ mất hứng dần vì thấy gửi mãi chẳng ai xử lý.
 *
 * ⚠️ ĐÁNH ĐỔI PHẢI NÓI RÕ:
 * Chặn ngầm cũng có thể chặn oan người vô can — máy ở tiệm net, điện thoại
 * mượn của người thân. Vì vậy:
 *   · Khoá LUÔN CÓ HẠN (24 giờ), không bao giờ vĩnh viễn
 *   · Đơn bị chặn VẪN ĐƯỢC LƯU, cán bộ xem lại được ở màn hình riêng
 *   · Cán bộ gỡ khoá được bất cứ lúc nào
 * Không lưu đơn thì mất luôn tin báo thật của người bị oan — hại hơn nhiều so
 * với việc để lọt vài đơn rác.
 */

import { layIpThat } from './helpers.js';

/* Thời hạn khoá — cố ý ngắn, xem phần đánh đổi ở trên */
const KHOA_THIET_BI_GIO = 24;
const KHOA_IP_GIO = 2;

/* Luật dự phòng theo IP: bao nhiêu đơn rác từ bao nhiêu thiết bị khác nhau
   trong bao lâu thì mới khoá IP. Đặt cao để không đụng người dùng bình thường. */
const NGUONG_SO_DON_RAC = 3;
const NGUONG_SO_THIET_BI = 3;
const CUA_SO_XET_GIO = 1;

/** Mã thiết bị hợp lệ: UUID v4 do trình duyệt sinh bằng crypto.randomUUID() */
const DANG_MA_THIET_BI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lấy mã thiết bị từ yêu cầu, có kiểm tra dạng.
 * Trả về chuỗi rỗng nếu không hợp lệ — khi đó chỉ còn lớp IP bảo vệ.
 */
export function layMaThietBi(req) {
  const id = String(req?.body?.deviceId || '').trim().toLowerCase();
  return DANG_MA_THIET_BI.test(id) ? id : '';
}

/**
 * Kiểm tra thiết bị hoặc IP có đang bị khoá không.
 *
 * @returns {Promise<{biKhoa: boolean, ly_do: string}>}
 */
export async function kiemTraBiKhoa(pool, { deviceId, ip }) {
  if (!deviceId && !ip) return { biKhoa: false, ly_do: '' };

  try {
    /* Câu truy vấn CỐ ĐỊNH, không ghép chuỗi.
       Trước đây tôi ghép động mệnh đề WHERE cho gọn — tuy các mảnh ghép đều
       là hằng do mình viết chứ không phải dữ liệu người dùng, nhưng ghép chuỗi
       vào câu SQL là thói quen xấu: hôm nay an toàn, mai có người sửa thêm một
       biến vào là thành lỗ hổng SQL injection.
       Truyền NULL cho phần không dùng, so sánh với NULL luôn sai nên tự loại. */
    const [rows] = await pool.query(
      `SELECT kind, reason FROM blacklists
        WHERE expires_at > NOW()
          AND (   (kind = 'device' AND identifier = ?)
               OR (kind = 'ip'     AND identifier = ?) )
        LIMIT 1`,
      [deviceId || null, ip || null]
    );
    if (rows.length === 0) return { biKhoa: false, ly_do: '' };
    return { biKhoa: true, ly_do: `${rows[0].kind}: ${rows[0].reason || 'không ghi lý do'}` };
  } catch (err) {
    /* Bảng chưa tạo (chưa chạy nang_cap_v12.sql) -> KHÔNG chặn ai.
       Thà để lọt spam còn hơn chặn oan toàn bộ người dân vì thiếu một bảng. */
    console.warn('[chặn spam] không kiểm tra được danh sách khoá:', err.message);
    return { biKhoa: false, ly_do: '' };
  }
}

/**
 * Khoá một thiết bị. Gọi khi cán bộ đánh dấu đơn là tin giả.
 *
 * Dùng ON DUPLICATE KEY để gia hạn nếu đã khoá trước đó — kẻ phá hoại bị bắt
 * lần hai thì đồng hồ tính lại từ đầu.
 */
export async function khoaThietBi(pool, { deviceId, staffId, lyDo }) {
  if (!deviceId) return false;
  try {
    await pool.query(
      `INSERT INTO blacklists (identifier, kind, reason, created_by, expires_at)
       VALUES (?, 'device', ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [deviceId, lyDo || 'Cán bộ đánh dấu tin giả', staffId || null,
       KHOA_THIET_BI_GIO, KHOA_THIET_BI_GIO]
    );
    console.warn(`[chặn spam] khoá thiết bị ${deviceId.slice(0, 8)}… trong ${KHOA_THIET_BI_GIO} giờ`);
    return true;
  } catch (err) {
    console.error('[chặn spam] khoá thiết bị lỗi:', err.message);
    return false;
  }
}

/** Gỡ khoá — cán bộ dùng khi biết chặn oan */
export async function goKhoa(pool, id) {
  const [kq] = await pool.query('DELETE FROM blacklists WHERE id = ?', [id]);
  return kq.affectedRows > 0;
}

/**
 * LUẬT DỰ PHÒNG THEO IP.
 *
 * Kẻ phá hoại tinh ranh sẽ xoá bộ nhớ trình duyệt sau mỗi lần bị khoá, để có
 * mã thiết bị mới. Khoá theo thiết bị lúc đó vô hiệu.
 *
 * Dấu hiệu nhận ra: cùng MỘT địa chỉ IP mà có NHIỀU mã thiết bị khác nhau
 * cùng gửi đơn rác trong thời gian ngắn. Người dùng bình thường không có kiểu
 * hành vi đó — kể cả khi dùng chung IP nhà mạng, họ cũng không cùng lúc bị
 * đánh dấu tin giả.
 *
 * Ngưỡng đặt cao (3 đơn rác từ 3 thiết bị khác nhau trong 1 giờ) và thời hạn
 * khoá ngắn (2 giờ) để hạn chế tối đa việc chặn oan cả vùng thuê bao.
 */
export async function xetKhoaIp(pool, ip) {
  if (!ip) return false;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS so_don, COUNT(DISTINCT device_id) AS so_thiet_bi
         FROM submissions
        WHERE ip_address = ?
          AND is_spam = 1
          AND device_id IS NOT NULL
          AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [ip, CUA_SO_XET_GIO]
    );
    const { so_don: soDon, so_thiet_bi: soThietBi } = rows[0] || {};
    if (Number(soDon) < NGUONG_SO_DON_RAC || Number(soThietBi) < NGUONG_SO_THIET_BI) {
      return false;
    }

    await pool.query(
      `INSERT INTO blacklists (identifier, kind, reason, created_by, expires_at)
       VALUES (?, 'ip', ?, NULL, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [ip, `Tự động: ${soDon} đơn rác từ ${soThietBi} thiết bị trong ${CUA_SO_XET_GIO} giờ`,
       KHOA_IP_GIO, KHOA_IP_GIO]
    );
    console.warn(`[chặn spam] khoá IP ${ip} trong ${KHOA_IP_GIO} giờ — ${soDon} đơn rác / ${soThietBi} thiết bị`);
    return true;
  } catch (err) {
    console.error('[chặn spam] xét khoá IP lỗi:', err.message);
    return false;
  }
}

/**
 * Hàm gọi từ route gửi ý kiến — gói gọn toàn bộ nghiệp vụ chặn.
 *
 * @returns {Promise<{chanNgam: boolean, deviceId: string}>}
 *   chanNgam = true -> vẫn lưu đơn và vẫn báo thành công, nhưng gắn is_spam = 1
 */
export async function xetTruocKhiNhan(pool, req) {
  const deviceId = layMaThietBi(req);
  const ip = layIpThat(req);
  const { biKhoa, ly_do } = await kiemTraBiKhoa(pool, { deviceId, ip });

  if (biKhoa) {
    console.warn(`[chặn spam] chặn ngầm một đơn — ${ly_do}`);
  }
  return { chanNgam: biKhoa, deviceId };
}
