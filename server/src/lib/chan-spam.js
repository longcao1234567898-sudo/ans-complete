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
 *
 * ---------------------------------------------------------------------------
 * KHOÁ TÁCH THEO LOẠI ĐƠN: ẨN DANH / CÓ TÊN (BUG-015, SEC-DEC-005)
 *
 * Khoá do đơn loại nào gây ra thì CHỈ chặn đơn loại đó. Trước đây một khoá
 * chặn mọi loại, và đó là đường lộ người tố giác: cán bộ đánh rác một đơn có
 * tên của ông P là khoá máy của P; tố giác ẩn danh P gửi sau đó bị chặn ngầm,
 * nằm trong danh sách nghi rác, tạo sau giờ khoá. Ít máy bị khoá thì đơn đó
 * gần như chắc chắn là của P. Chiều ngược lại cũng vậy.
 *
 * Đánh đổi đã chấp nhận: kẻ phá hoại gửi cả hai loại thì cán bộ phải bấm "Tin
 * rác" thêm một lần mới khoá được loại còn lại. Các lớp khác không đổi.
 *
 * Không nói rõ loại đơn thì KHÔNG KHOÁ và KHÔNG CHẶN — đoán sai loại là mở lại
 * đúng đường lộ ở trên. Dòng khoá cũ (trước nang_cap_v19.sql) mang 'khong_ro'
 * nên không chặn gì.
 *
 * ---------------------------------------------------------------------------
 * ĐƠN ẨN DANH KHÔNG CHỊU HẬU QUẢ NÀO THEO MÁY HAY THEO MẠNG (BUG-017, SEC-DEC-008 M-B)
 *
 * Tách theo loại vẫn để lại đường nối ẩn danh↔ẩn danh: chị Hoa chỉ có một điện
 * thoại, cán bộ C đánh rác tố giác đầu của chị -> máy bị khoá loại ẩn danh -> tố
 * giác thứ hai bị chặn ngầm, nằm ở nghi rác, tạo sau giờ khoá. C gộp hai đơn lại
 * là đoán ra người. Nên với đơn ẩn danh: không lưu mã máy, không khoá, không
 * đếm tái phạm, không khoá IP, không bao giờ bị chặn ngầm. Mọi hàm dưới đây hỏi
 * loaiDonChiuKhoa — một cửa duy nhất, mặc định từ chối, chỉ mở cho đơn có tên.
 *
 * Đánh đổi đã chấp nhận: kẻ rải rác ẩn danh không còn bị khoá máy. Còn lại
 * Turnstile, giới hạn theo IP (2 đơn ẩn danh/ngày, chờ 10 phút, chặn trùng) và
 * hàng chờ kiểm duyệt. Khoá máy vốn không chặn được người mở tab ẩn danh.
 */

import { layIpThat } from './helpers.js';

/**
 * Giá trị cột blacklists.loai_don cho một đơn ĐƯỢC PHÉP kéo theo hậu quả lên
 * máy/mạng. Chỉ đơn có tên (anDanh === false) -> 'co_ten'. Còn lại -> null, và
 * bên gọi phải coi null là "không khoá, không chặn, không đếm":
 *   · anDanh === true: đơn ẩn danh — cố ý, xem phần M-B ở đầu tệp
 *   · không phải boolean: bên gọi quên nói loại — ghi log để người sửa biết
 *
 * Trước đây ẩn danh trả 'an_danh' và bị khoá riêng loại đó. Đừng thêm lại:
 * cột loai_don vẫn còn giá trị 'an_danh' chỉ vì dữ liệu cũ, không để ghi mới.
 */
function loaiDonChiuKhoa(anDanh, viec) {
  if (anDanh === false) return 'co_ten';
  if (anDanh !== true) console.error(`[chặn spam] ${viec} bị gọi thiếu cờ anDanh — bỏ qua`);
  return null;
}

/**
 * Đơn có tính là ẩn danh không, từ giá trị cột submissions.is_anonymous.
 * Cột cho phép NULL: không rõ thì coi là ẩn danh — cùng quy ước với xét tái phạm,
 * để một đơn không rõ loại không bao giờ gây khoá lên kênh có tên.
 */
export function laDonAnDanh(isAnonymous) {
  return isAnonymous == null || Number(isAnonymous) !== 0;
}

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
 * Kiểm tra thiết bị hoặc IP có đang bị khoá cho ĐÚNG LOẠI ĐƠN sắp gửi không.
 *
 * @param {boolean} anDanh đơn sắp gửi có ẩn danh không — BẮT BUỘC, xem phần
 *   "khoá tách theo loại đơn" ở đầu tệp.
 * @returns {Promise<{biKhoa: boolean, ly_do: string}>}
 */
export async function kiemTraBiKhoa(pool, { deviceId, ip, anDanh }) {
  if (!deviceId && !ip) return { biKhoa: false, ly_do: '' };
  /* Đơn ẩn danh không bao giờ bị chặn ngầm — kể cả khi CSDL còn sót dòng khoá
     'an_danh' của mã cũ (phòng thủ hai lớp cho nang_cap_v22.sql) */
  const loai = loaiDonChiuKhoa(anDanh, 'kiểm khoá');
  if (!loai) return { biKhoa: false, ly_do: '' };

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
          AND loai_don = ?
          AND (   (kind = 'device' AND identifier = ?)
               OR (kind = 'ip'     AND identifier = ?) )
        LIMIT 1`,
      [loai, deviceId || null, ip || null]
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
 * lần hai thì đồng hồ tính lại từ đầu. "Bắt lần hai" phải là một ĐƠN KHÁC: bên
 * gọi kiểm bằng xetDonGayKhoa, xem ở đó.
 *
 * @param {boolean} anDanh đơn gây khoá có ẩn danh không — BẮT BUỘC.
 */
export async function khoaThietBi(pool, { deviceId, staffId, lyDo, anDanh }) {
  if (!deviceId) return false;
  const loai = loaiDonChiuKhoa(anDanh, 'khoá thiết bị');
  if (!loai) return false;
  /* Thiết bị tin cậy (kiosk, máy dùng chung) KHÔNG bao giờ bị khoá tự động.
     Xem chú thích trong kiemTraBiKhoa. */
  if (await laThietBiTinCay(pool, deviceId)) {
    console.warn(`[chặn spam] bỏ qua khoá — thiết bị ${deviceId.slice(0, 8)}… được đánh dấu tin cậy`);
    return false;
  }
  try {
    await pool.query(
      `INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
       VALUES (?, 'device', ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [deviceId, loai, lyDo || 'Cán bộ đánh dấu tin giả', staffId || null,
       KHOA_THIET_BI_GIO, KHOA_THIET_BI_GIO]
    );
    console.warn(`[chặn spam] khoá thiết bị ${deviceId.slice(0, 8)}… trong ${KHOA_THIET_BI_GIO} giờ`);
    return true;
  } catch (err) {
    console.error('[chặn spam] khoá thiết bị lỗi:', err.message);
    return false;
  }
}

/**
 * Ghi chú CỐ ĐỊNH của dòng status_history đánh dấu "cán bộ đánh rác một đơn bị
 * chặn ngầm lúc nhận". xetKhoaTaiPham đọc đúng chuỗi này để KHÔNG đếm đơn đó.
 * Viết một nơi, đọc một nơi — đổi chữ thì cả hai đổi theo.
 */
export const GHI_CHU_KHONG_TINH_TAI_PHAM =
  'Đánh dấu tin rác — đơn bị chặn ngầm lúc nhận, không tính tái phạm';

/**
 * Lần đánh rác này có được kéo theo hậu quả theo thiết bị (khoá, xét tái phạm)
 * không. Đơn vẫn bị đánh rác và vào thùng rác như thường; chỉ phần hậu quả lên
 * MÁY là bị bỏ. Một đơn chỉ gây khoá MỘT lần (BUG-015).
 *
 * KHÔNG gây khoá nếu một trong các điều sau đúng — mỗi điều đọc từ DỮ LIỆU CỦA
 * CHÍNH ĐƠN, không từ trạng thái hiện tại (status bị ghi đè được: đơn chặn ngầm
 * có ảnh nghi ngờ bị đổi sang 'pending_review' lúc nhận):
 *
 *   · is_spam = 1. Cờ này bật khi đơn bị CHẶN NGẦM lúc nhận, hoặc khi đơn đã bị
 *     mark-spam (hoặc bị cuốn theo lô, trước BUG-018). Khôi phục khỏi thùng
 *     rác KHÔNG gỡ nó. Chặn ngầm: máy đã bị khoá lúc đơn tới, đơn không nói thêm gì về máy — cho nó gây
 *     khoá là gia hạn khoá mãi được và đẩy lên 30 ngày. Đã bị đánh rác: khôi
 *     phục rồi đánh rác lại là làm mới khoá 24 giờ, lặp mỗi ngày là dập kênh
 *     của một người vô thời hạn chỉ bằng một đơn.
 *   · Đơn đang chờ duyệt mà đã có reviewed_by: đã qua kiểm duyệt, bị đưa vào
 *     thùng rác, rồi được khôi phục về hàng chờ. Đường /review không bật
 *     is_spam nên cần dấu này.
 *   · Có dòng status_history 'spam' do cán bộ ghi — lớp thứ ba, cho đường nào
 *     sau này đưa đơn về mà không để lại hai dấu trên.
 *
 * khongTinhTaiPham: đơn bị chặn ngầm lúc nhận (is_spam = 1 mà chưa từng có
 * quyết định rác của cán bộ). Route PHẢI ghi dòng lịch sử với
 * GHI_CHU_KHONG_TINH_TAI_PHAM trước khi đánh rác, để xetKhoaTaiPham loại nó ra.
 *
 * Phải gọi TRƯỚC khi route ghi dòng status_history của lần đánh rác hiện tại.
 * Lỗi truy vấn -> không khoá: khoá thiếu một lần nhẹ hơn khoá oan vô hạn.
 *
 * @param {{id, is_spam, status, reviewed_by}} don hàng đơn đọc TRƯỚC khi đánh rác
 */
export async function xetDonGayKhoa(pool, don) {
  const daChan = Number(don.is_spam) === 1;
  const daQuaKiemDuyet = don.status === 'pending_review' && don.reviewed_by != null;
  let daTungDanhRac;
  try {
    const [rows] = await pool.query(
      `SELECT 1 FROM status_history
        WHERE submission_id = ? AND new_status = 'spam' AND changed_by IS NOT NULL
        LIMIT 1`,
      [don.id]
    );
    daTungDanhRac = rows.length > 0;
  } catch (err) {
    console.error('[chặn spam] không đọc được lịch sử đơn — không khoá:', err.message);
    return { gayKhoa: false, khongTinhTaiPham: daChan };
  }
  return {
    gayKhoa: !daChan && !daQuaKiemDuyet && !daTungDanhRac,
    khongTinhTaiPham: daChan && !daTungDanhRac,
  };
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
 *
 * @param {boolean} anDanh loại của đơn vừa bị đánh rác — BẮT BUỘC. Chỉ đếm đơn
 *   có tên; đơn ẩn danh không bao giờ tái phạm (M-B). Hai đơn ẩn danh rác cộng
 *   một đơn có tên rác không phải "ba lần" của loại nào.
 */
export async function xetKhoaTaiPham(pool, { deviceId, staffId, anDanh }) {
  if (!deviceId) return { taiPham: false, soLan: 0 };
  const loai = loaiDonChiuKhoa(anDanh, 'xét tái phạm');
  if (!loai) return { taiPham: false, soLan: 0 };
  /* Thiết bị tin cậy không bao giờ bị khoá, kể cả tái phạm. */
  if (await laThietBiTinCay(pool, deviceId)) return { taiPham: false, soLan: 0 };
  try {
    /* Lấy BA quyết định gần nhất của cán bộ với thiết bị này.

       Chỉ tính đơn ĐÃ CÓ QUYẾT ĐỊNH: bị đánh tin rác, hoặc đã được duyệt/xử
       lý. Đơn còn nằm chờ chưa ai đụng tới thì chưa nói lên điều gì, đưa vào
       đếm sẽ làm chuỗi sai lệch.

       ⚠️ MỘT ĐƠN RÁC CHỈ LÀ MỘT QUYẾT ĐỊNH KHI CÁN BỘ TỰ BẤM TRÊN CHÍNH ĐƠN ĐÓ
       (BUG-018, SEC-DEC-008 M-D). Bằng chứng là dòng status_history 'spam' có
       changed_by — chỉ review và mark-spam ghi dòng này, mỗi cú bấm một dòng
       trên đúng đơn được bấm. KHÔNG đếm theo deleted_by: dọn theo lô trước đây
       cũng đặt deleted_by cho các đơn nó cuốn, nên một cú bấm hiện ra thành
       "ba lần liên tiếp" và khoá 30 ngày kênh có tên của một người. Đơn bị cuốn
       từ trước bản vá không có dòng lịch sử đó -> không được đếm.
       Đánh đổi: CSDL chưa chạy va_loi_duyet_tin_an_danh.sql (ENUM thiếu 'spam')
       thì route không ghi được dòng lịch sử, nên cú bấm thật cũng không được
       đếm — tái phạm yếu đi, nhưng không bao giờ khoá 30 ngày mà thiếu bằng
       chứng. Khoá 24 giờ vẫn chạy.

       ⚠️ Không đếm đơn bị chặn ngầm (is_spam = 1 do máy tự gắn khi thiết bị
       đang bị khoá). Đó là máy tự gắn chứ không phải cán bộ xem rồi kết luận;
       gộp vào thì một lần khoá 24 giờ tự đẻ ra chuỗi ba lần, khoá tiếp một
       tháng — thiết bị bị khoá oan leo thang mà không ai bấm nút nào cả.
       Cán bộ đánh rác TAY một đơn chặn ngầm thì có dòng lịch sử, nhưng đơn
       vẫn không được đếm (BUG-015): route ghi dòng đó với ghi chú
       GHI_CHU_KHONG_TINH_TAI_PHAM (xem xetDonGayKhoa), và câu dưới loại nó ra. */
    const [rows] = await pool.query(
      `SELECT status
         FROM submissions
        WHERE device_id = ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          /* Chỉ đơn cùng loại. is_anonymous NULL coi là ẩn danh (laDonAnDanh). */
          AND (COALESCE(is_anonymous, 1) <> 0) = ?
          AND (
                (status = 'spam'
                  AND EXISTS (SELECT 1 FROM status_history h
                               WHERE h.submission_id = submissions.id
                                 AND h.new_status = 'spam' AND h.changed_by IS NOT NULL)
                  AND NOT EXISTS (SELECT 1 FROM status_history h
                                   WHERE h.submission_id = submissions.id
                                     AND h.new_status = 'spam' AND h.note = ?))
             OR  status IN ('received','processing','resolved','rejected')
              )
        ORDER BY COALESCE(reviewed_at, updated_at, created_at) DESC
        LIMIT ?`,
      [deviceId, CUA_SO_TAI_PHAM_NGAY, anDanh ? 1 : 0, GHI_CHU_KHONG_TINH_TAI_PHAM, NGUONG_TAI_PHAM]
    );

    const đủSốLần = rows.length >= NGUONG_TAI_PHAM;
    const toànTinRác = rows.every((r) => r.status === 'spam');
    if (!đủSốLần || !toànTinRác) {
      return { taiPham: false, soLan: rows.filter((r) => r.status === 'spam').length };
    }

    await pool.query(
      `INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
       VALUES (?, 'device', ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [deviceId, loai,
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
   KHÔNG CÒN DỌN THEO LÔ (BUG-018, SEC-DEC-008 M-D)

   Trước đây mỗi cú "Tin rác" còn đưa vào thùng rác mọi đơn cùng máy, cùng loại,
   gửi trong 24 giờ trước. Đã GỠ, đừng thêm lại:
     · Một cú bấm thành "ba lần liên tiếp": các đơn bị cuốn mang deleted_by của
       cán bộ, xét tái phạm đếm chúng -> kênh có tên của một nhân chứng gửi ba
       đơn trong ngày bị chặn ngầm 30 ngày chỉ bằng một cú bấm.
     · Đơn thật bị cuốn nằm trong thùng rác, tự xoá vĩnh viễn sau 7 ngày.
     · Thùng rác hiện "nhiều đơn cùng giây, cùng người xoá" — nhóm đơn cùng máy.
   Mỗi cú bấm nay chỉ tác động đúng một đơn. Đánh đổi: kẻ phá gửi nhiều đơn có
   tên thì cán bộ bấm từng đơn — máy đã bị khoá 24 giờ ngay từ cú đầu, và giới
   hạn 5 đơn/giờ theo IP vẫn chạy.
   ============================================================================ */

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
 *
 * @param {boolean} anDanh đơn gây khoá có ẩn danh không — BẮT BUỘC. Khoá IP
 *   chặn cả vùng thuê bao; chặn chéo loại thì tố giác ẩn danh của cả vùng đó
 *   rơi vào nghi rác chỉ vì một đơn có tên. Đơn ẩn danh không khoá IP (M-B).
 */
export async function khoaIpThuCong(pool, { ip, staffId, lyDo, anDanh }) {
  if (!ip) return false;
  const loai = loaiDonChiuKhoa(anDanh, 'khoá IP');
  if (!loai) return false;
  try {
    await pool.query(
      `INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
       VALUES (?, 'ip', ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         reason     = VALUES(reason),
         created_by = VALUES(created_by),
         expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [ip, loai, (lyDo || 'Cán bộ đánh dấu tin rác') + ' (hồ sơ không có mã thiết bị)',
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
 *
 * @param {boolean} anDanh loại của đơn vừa bị chặn — BẮT BUỘC. Chỉ đếm và chỉ
 *   khoá trong đúng loại đó. Đơn ẩn danh không khoá IP (M-B).
 */
export async function xetKhoaIp(pool, ip, { anDanh } = {}) {
  if (!ip) return false;
  const loai = loaiDonChiuKhoa(anDanh, 'xét khoá IP');
  if (!loai) return false;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS so_don, COUNT(DISTINCT device_id) AS so_thiet_bi
         FROM submissions
        WHERE ip_address = ?
          AND is_spam = 1
          AND device_id IS NOT NULL
          AND (COALESCE(is_anonymous, 1) <> 0) = ?
          AND created_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [ip, anDanh ? 1 : 0, CUA_SO_XET_GIO]
    );
    const { so_don: soDon, so_thiet_bi: soThietBi } = rows[0] || {};
    if (Number(soDon) < NGUONG_SO_DON_RAC || Number(soThietBi) < NGUONG_SO_THIET_BI) {
      return false;
    }

    await pool.query(
      `INSERT INTO blacklists (identifier, kind, loai_don, reason, created_by, expires_at)
       VALUES (?, 'ip', ?, ?, NULL, DATE_ADD(NOW(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR)`,
      [ip, loai, `Tự động: ${soDon} đơn rác từ ${soThietBi} thiết bị trong ${CUA_SO_XET_GIO} giờ`,
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
 *   deviceId = '' với đơn ẩn danh -> route không có mã máy nào để lưu
 */
export async function xetTruocKhiNhan(pool, req) {
  /* Cùng một biểu thức với routes/submissions.js (isAnonymous) — hai nơi đọc
     từ cùng một trường thì không thể lệch nhau về loại đơn. */
  const anDanh = req?.body?.isAnonymous === true;
  /* Đơn ẩn danh: KHÔNG đọc mã máy (M-B). Lưu nó trên đơn là để người cầm bản
     sao CSDL nối tố giác với đơn có tên cùng máy — mã máy không chỉ ra ai, nó
     chỉ nói "hai đơn cùng một máy", và đó chính là điều cần giấu. */
  const deviceId = anDanh ? '' : layMaThietBi(req);
  const ip = layIpThat(req);
  const { biKhoa, ly_do } = await kiemTraBiKhoa(pool, { deviceId, ip, anDanh });

  if (biKhoa) {
    console.warn(`[chặn spam] chặn ngầm một đơn — ${ly_do}`);
  }
  return { chanNgam: biKhoa, deviceId };
}
