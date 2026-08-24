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
    /* THIẾT BỊ TIN CẬY được miễn trừ trước mọi thứ.

       Máy kiosk ở trụ sở, máy tính bảng ở nhà văn hoá, máy dùng chung tại điểm
       hỗ trợ — nhiều người gửi qua cùng một thiết bị nên chung một device_id.
       Không có miễn trừ thì một người gửi tin rác là khoá cả máy, mọi người
       sau đó không gửi được. Mà đây đúng là thiết bị phục vụ người yếu thế
       nhất — người không có điện thoại riêng.

       Cán bộ ngồi cạnh máy kiosk đã là lớp kiểm soát, nên miễn khoá tự động là
       an toàn. Đánh dấu tin cậy qua trang quản trị (danh sách chặn). */
    const [tc] = await pool.query(
      `SELECT 1 FROM blacklists
        WHERE kind = 'trusted_device' AND identifier = ?
        LIMIT 1`,
      [deviceId || null]
    );
    if (tc.length > 0) return { biKhoa: false, ly_do: '', tinCay: true };

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
 * Thiết bị này có được đánh dấu tin cậy không?
 * Dùng để chặn khoá tự động NGAY TỪ ĐẦU — thiết bị tin cậy không bao giờ bị
 * khoá dù bị đánh dấu tin rác bao nhiêu lần.
 */
export async function laThietBiTinCay(pool, deviceId) {
  if (!deviceId) return false;
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM blacklists WHERE kind = 'trusted_device' AND identifier = ? LIMIT 1`,
      [deviceId]
    );
    return rows.length > 0;
  } catch {
    return false;
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
  /* Thiết bị tin cậy (kiosk, máy dùng chung) KHÔNG bao giờ bị khoá tự động.
     Xem chú thích trong kiemTraBiKhoa. */
  if (await laThietBiTinCay(pool, deviceId)) {
    console.warn(`[chặn spam] bỏ qua khoá — thiết bị ${deviceId.slice(0, 8)}… được đánh dấu tin cậy`);
    return false;
  }
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

/* ============================================================================
   TÁI PHẠM: BA LẦN TIN RÁC LIÊN TIẾP TRONG MỘT THÁNG -> KHOÁ MỘT THÁNG

   Khoá thường chỉ 24 giờ, cố ý ngắn để không chặn oan. Nhưng thiết bị nào bị
   cán bộ đánh dấu tin rác BA LẦN LIÊN TIẾP thì không còn là nhầm lẫn nữa —
   khoá dài để cán bộ khỏi phải dọn đi dọn lại một địa chỉ.

   ⚠️ "LIÊN TIẾP" CHỨ KHÔNG PHẢI "CỘNG DỒN".
   Đếm cộng dồn thì một người gửi năm mươi tin báo thật và lỡ ba tin bị đánh
   nhầm trong cả tháng cũng bị khoá — mất hẳn một người báo tin tích cực. Nên
   chỉ xét BA QUYẾT ĐỊNH GẦN NHẤT của cán bộ với thiết bị đó: cả ba đều là tin
   rác mới khoá. Xen giữa có một đơn được duyệt là chuỗi đứt, đếm lại từ đầu.

   ⚠️ KHOÁ VẪN CÓ HẠN. Một tháng, không vĩnh viễn. Mã thiết bị đổi chủ được:
   máy tiệm net, điện thoại mượn, máy để ở trụ sở cho bà con dùng chung. Khoá
   vĩnh viễn là chặn oan người vô can về sau, và không ai nhớ ra mà gỡ.
   ============================================================================ */

/** Ba lần liên tiếp thì khoá */
const NGUONG_TAI_PHAM = 3;
/** Cửa sổ xét: chỉ tính các quyết định trong vòng 30 ngày gần đây */
const CUA_SO_TAI_PHAM_NGAY = 30;
/** Khoá tái phạm: 30 ngày */
const KHOA_TAI_PHAM_GIO = 30 * 24;

/**
 * Xét xem thiết bị có tái phạm không; nếu có thì khoá dài hạn.
 *
 * Trả về { taiPham, soLan } để route báo lại cho cán bộ biết.
 */
export async function xetKhoaTaiPham(pool, { deviceId, staffId }) {
  if (!deviceId) return { taiPham: false, soLan: 0 };
  /* Thiết bị tin cậy không bao giờ bị khoá, kể cả tái phạm. */
  if (await laThietBiTinCay(pool, deviceId)) return { taiPham: false, soLan: 0 };
  try {
    /* Lấy BA quyết định gần nhất của cán bộ với thiết bị này.

       Chỉ tính đơn ĐÃ CÓ QUYẾT ĐỊNH: bị đánh tin rác, hoặc đã được duyệt/xử
       lý. Đơn còn nằm chờ chưa ai đụng tới thì chưa nói lên điều gì, đưa vào
       đếm sẽ làm chuỗi sai lệch.

       ⚠️ Không đếm đơn bị chặn ngầm (is_spam = 1 do máy tự gắn khi thiết bị
       đang bị khoá). Đó là máy tự gắn chứ không phải cán bộ xem rồi kết luận;
       gộp vào thì một lần khoá 24 giờ tự đẻ ra chuỗi ba lần, khoá tiếp một
       tháng — thiết bị bị khoá oan leo thang mà không ai bấm nút nào cả. */
    const [rows] = await pool.query(
      `SELECT status
         FROM submissions
        WHERE device_id = ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND (
                (status = 'spam' AND deleted_by IS NOT NULL)
             OR  status IN ('received','processing','resolved','rejected')
              )
        ORDER BY COALESCE(reviewed_at, updated_at, created_at) DESC
        LIMIT ?`,
      [deviceId, CUA_SO_TAI_PHAM_NGAY, NGUONG_TAI_PHAM]
    );

    const đủSốLần = rows.length >= NGUONG_TAI_PHAM;
    const toànTinRác = rows.every((r) => r.status === 'spam');
    if (!đủSốLần || !toànTinRác) {
      return { taiPham: false, soLan: rows.filter((r) => r.status === 'spam').length };
    }

    await pool.query(
      `INSERT INTO blacklists (identifier, kind, reason, created_by, expires_at)
       VALUES (?, 'device', ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [deviceId,
       `Tái phạm: ${NGUONG_TAI_PHAM} lần tin rác liên tiếp trong ${CUA_SO_TAI_PHAM_NGAY} ngày`,
       staffId || null, KHOA_TAI_PHAM_GIO, KHOA_TAI_PHAM_GIO]
    );
    console.warn(`[chặn spam] TÁI PHẠM — khoá thiết bị ${deviceId.slice(0, 8)}… trong 30 ngày`);
    return { taiPham: true, soLan: NGUONG_TAI_PHAM };
  } catch (err) {
    console.error('[chặn spam] xét tái phạm lỗi:', err.message);
    return { taiPham: false, soLan: 0 };
  }
}

/* ============================================================================
   DỌN ĐƠN CÙNG THIẾT BỊ TRONG 24 GIỜ TRƯỚC ĐÓ

   Kẻ rải tin rác hiếm khi gửi đúng một đơn. Cán bộ bắt được một đơn thì thường
   còn cả loạt nằm trong hàng chờ. Quét luôn 24 giờ trước đó đỡ cho cán bộ phải
   mở từng đơn mà bấm.

   ⚠️ ĐƯA VÀO THÙNG RÁC, KHÔNG XOÁ HẲN.
   Thùng rác giữ 7 ngày, khôi phục được. Quét theo lô kiểu này chắc chắn sẽ có
   lúc quét nhầm — máy dùng chung, hoặc một đơn thật gửi xen giữa loạt rác. Xoá
   hẳn thì mất luôn tin báo thật mà không ai biết đường lấy lại.

   ⚠️ KHÔNG ĐỤNG ĐƠN CÁN BỘ ĐÃ XỬ LÝ.
   Đơn đang xử lý, đã giải quyết, hoặc đã phân công cho ai đó là đơn đã có
   người ĐỌC VÀ QUYẾT ĐỊNH. Máy quét đè lên quyết định của người là sai — có
   thể xoá mất một vụ việc đang điều tra dở. Chỉ quét đơn CÒN NGUYÊN trong
   hàng chờ: mới nhận hoặc chờ kiểm duyệt, chưa ai đụng tới.
   ============================================================================ */

/** Cửa sổ dọn: 24 giờ trước thời điểm đơn bị đánh dấu */
const CUA_SO_DON_DEP_GIO = 24;

/**
 * Đưa vào thùng rác các đơn khác cùng thiết bị gửi trong 24 giờ trước đó.
 *
 * @returns số đơn đã dọn
 */
export async function donDonCungThietBi(pool, { deviceId, boQuaId, staffId, lyDo }) {
  if (!deviceId) return 0;
  try {
    const [kq] = await pool.query(
      `UPDATE submissions
          SET status = 'spam', is_spam = 1,
              deleted_at = NOW(), deleted_by = ?,
              rejection_reason = ?
        WHERE device_id = ?
          AND id <> ?
          AND deleted_at IS NULL
          AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
          /* CHỈ đơn chưa ai đụng tới — xem phần chú thích ở trên */
          AND status IN ('pending_review','received')
          AND assigned_to IS NULL`,
      [staffId || null,
       lyDo || `Dọn theo lô: cùng thiết bị với một đơn bị đánh dấu tin rác`,
       deviceId, boQuaId || 0, CUA_SO_DON_DEP_GIO]
    );
    const soDon = kq?.affectedRows || 0;
    if (soDon > 0) {
      console.warn(`[chặn spam] dọn ${soDon} đơn cùng thiết bị ${deviceId.slice(0, 8)}… trong ${CUA_SO_DON_DEP_GIO} giờ`);
    }
    return soDon;
  } catch (err) {
    console.error('[chặn spam] dọn đơn cùng thiết bị lỗi:', err.message);
    return 0;
  }
}

/**
 * Khoá theo ĐỊA CHỈ IP — chỉ dùng khi hồ sơ không có mã thiết bị.
 *
 * ⚠️ ĐÂY LÀ ĐƯỜNG LUI, KHÔNG PHẢI CÁCH CHÍNH.
 * Nhà mạng di động dùng CGNAT nên khoá IP có thể chặn oan người khác. Vì vậy:
 *   · Thời hạn NGẮN HƠN nhiều so với khoá thiết bị (2 giờ thay vì 24 giờ)
 *   · Ghi rõ lý do để cán bộ biết đây là khoá diện rộng mà cân nhắc gỡ sớm
 *
 * Dùng khi nào: hồ sơ gửi TRƯỚC khi hệ thống có tính năng mã thiết bị, hoặc
 * người gửi tắt localStorage. Không có đường lui này thì cán bộ bấm "Tin rác"
 * mà chẳng chặn được gì — kẻ phá hoại gửi tiếp ngay.
 */
export async function khoaIpThuCong(pool, { ip, staffId, lyDo }) {
  if (!ip) return false;
  try {
    await pool.query(
      `INSERT INTO blacklists (identifier, kind, reason, created_by, expires_at)
       VALUES (?, 'ip', ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [ip, (lyDo || 'Cán bộ đánh dấu tin rác') + ' (hồ sơ không có mã thiết bị)',
       staffId || null, KHOA_IP_GIO, KHOA_IP_GIO]
    );
    console.warn(`[chặn spam] khoá IP ${ip} trong ${KHOA_IP_GIO} giờ — hồ sơ không có mã thiết bị`);
    return true;
  } catch (err) {
    console.error('[chặn spam] khoá IP lỗi:', err.message);
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
