import crypto from 'node:crypto';

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Sinh mã tra cứu 6 ký tự (bỏ 0/O, 1/I/L) */
export function generateTrackingCode(len = 6) {
  let code = '';
  for (let i = 0; i < len; i++) code += CHARSET[crypto.randomInt(CHARSET.length)];
  return code;
}

/** SHA-256 của nội dung — phục vụ chặn gửi trùng (chống spam) */
export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Nhãn trạng thái tiếng Việt (khớp frontend) */
export const STATUS_LABEL = {
  pending_review: 'Chờ kiểm duyệt',
  spam: 'Không tiếp nhận (tin rác)',
  received: 'Đã tiếp nhận',
  processing: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  rejected: 'Từ chối',
};

/* ============================================================================
   LẤY ĐỊA CHỈ IP THẬT CỦA NGƯỜI GỬI

   ⚠️ TRƯỚC ĐÂY 8 CHỖ TRONG MÃ NGUỒN VIẾT NHƯ SAU:
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

   Cách đó SAI VÀ NGUY HIỂM. Lý do:

   Header X-Forwarded-For là một danh sách nối dài. Khi yêu cầu đi qua proxy
   của Render, Render NỐI THÊM địa chỉ thật vào CUỐI danh sách:

        X-Forwarded-For: <giá trị người gửi tự đặt>, <IP thật do Render thêm>

   Lấy phần tử [0] tức là lấy đúng phần NGƯỜI GỬI TỰ ĐIỀN. Chỉ cần thêm một
   dòng header là giả được IP bất kỳ. Hậu quả:

     · Chống spam vô hiệu — đổi IP giả mỗi lần gửi là qua hết giới hạn
     · Giới hạn 5 lần đăng nhập sai / 15 phút bị vượt, dò được mật khẩu
     · Nhật ký ghi sai IP — điều tra về sau dựa vào dữ liệu bịa

   CÁCH ĐÚNG: dùng req.ip của Express.
   Máy chủ đã đặt app.set('trust proxy', 1), nghĩa là Express tin ĐÚNG MỘT
   lớp proxy và tự lấy phần tử áp chót — phần do Render ghi, người gửi không
   can thiệp được.
   ============================================================================ */
export function layIpThat(req) {
  /* Chuẩn hoá nằm TRONG hàm, không để nơi gọi tự làm.
     Vì sao quan trọng: chuỗi IP này được BĂM rồi dùng làm khoá đối chiếu ở
     nhiều nơi (hạn mức chống spam, đếm tin ẩn danh theo thiết bị, phát hiện
     trùng lặp). Hai chỗ xử lý chuỗi khác nhau là ra hai bản băm khác nhau,
     và mọi phép đối chiếu âm thầm trượt hết. Gom vào một chỗ là hết đường lệch. */
  const tho = String(req?.ip || '').trim();

  /* BÓC TIỀN TỐ IPv4-mapped "::ffff:".
     Node trả cùng một máy khách lúc là "192.168.1.7", lúc là
     "::ffff:192.168.1.7" tuỳ socket đang chạy IPv4 hay dual-stack. Không bóc
     thì cùng một người ra hai khoá băm khác nhau -> hạn mức chống spam và
     giới hạn tin ẩn danh/ngày đếm nhầm thành hai thiết bị riêng biệt.
     Chỉ bóc khi phần còn lại đúng là IPv4, để không cắt nhầm IPv6 thật. */
  const daBoc = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(tho);

  return (daBoc ? daBoc[1] : tho).slice(0, 45);
}

/* ============================================================================
   GHI NHẬT KÝ THAO TÁC CÁN BỘ — GOM VỀ MỘT HÀM (nhật ký gia cố)

   Trước đây mỗi route tự viết câu INSERT vào staff_activity_logs, mỗi nơi một
   kiểu: chỗ có ip, chỗ không; chỗ ghi details, chỗ bỏ. Rải rác nên dễ sót —
   thêm hành động mới mà quên ghi log là mất dấu vết, đúng thứ không được phép
   mất với dữ liệu nhà nước.

   Gom về một hàm: mọi thao tác nhạy cảm (xem danh tính, xuất dữ liệu, xem bản
   đồ, đổi trạng thái) đều gọi cùng một chỗ, ghi đủ AI-KHI NÀO-TỪ ĐÂU-VIỆC GÌ.
   ghiNhatKy không bao giờ ném lỗi ra ngoài: ghi log hỏng thì cảnh báo rồi cho
   việc chính chạy tiếp, vì chặn một thao tác xử lý thường chỉ vì không ghi được
   log là hại nhiều hơn lợi. NGOẠI LỆ là việc xem/mang ra thứ nhạy cảm và việc
   không hoàn tác được — những việc đó gọi ghiNhatKyTruoc (bên dưới).
   Mã hành động khai ở lib/danh-muc-nhat-ky.js.
   ============================================================================ */
export async function ghiNhatKy(pool, req, viec) {
  try {
    await ghiNhatKyTruoc(pool, req, viec);
  } catch (e) {
    console.warn('[nhật ký] không ghi được:', e.message);
  }
}

/**
 * GHI NHẬT KÝ BẮT BUỘC — ném lỗi nếu không ghi được (ADR-003 việc 9).
 *
 * Dùng khi việc chính là XEM/MANG RA thứ nhạy cảm (danh tính, tin chỉ lãnh đạo
 * xem, xuất dữ liệu, mở nhật ký) hoặc là việc KHÔNG HOÀN TÁC được (xoá vĩnh
 * viễn): gọi TRƯỚC, ném lỗi thì route trả lỗi và không làm việc chính. Không có
 * lớp phân công nào khác đứng giữa lãnh đạo với các việc này — nhật ký là thứ
 * duy nhất để lãnh đạo kiểm lẫn nhau, nên không có dấu vết thì không cho làm.
 *
 * @param {object} viec
 * @param {string} viec.hanhDong     mã trong lib/danh-muc-nhat-ky.js
 * @param {number} [viec.staffId]    ghi thay req.staff (đăng xuất: chưa qua requireAuth)
 * @param {number} [viec.gopPhut]    cùng người, cùng việc, cùng đối tượng đã ghi trong
 *   chừng ấy phút thì không ghi thêm — cho các lượt XEM bị giao diện tải lại khi
 *   chuyển tab; lần mở đầu tiên vẫn luôn được ghi
 */
export async function ghiNhatKyTruoc(pool, req, {
  hanhDong, loaiDoiTuong = null, doiTuongId = null, chiTiet = null, staffId, gopPhut = 0,
}) {
  const nguoi = staffId ?? req?.staff?.id ?? null;
  const ma = String(hanhDong).slice(0, 50);
  if (gopPhut > 0 && nguoi != null) {
    const [r] = await pool.query(
      `SELECT 1 FROM staff_activity_logs
        WHERE staff_id = ? AND action = ?
          AND (target_id = ? OR (target_id IS NULL AND ? IS NULL))
          AND created_at > NOW() - INTERVAL ? MINUTE
        LIMIT 1`,
      [nguoi, ma, doiTuongId, doiTuongId, Number(gopPhut)]
    );
    if (r.length > 0) return;
  }
  await pool.query(
    `INSERT INTO staff_activity_logs
       (staff_id, action, target_type, target_id, details, ip_address)
     VALUES (?,?,?,?,?,?)`,
    [
      nguoi,
      ma,
      loaiDoiTuong,
      doiTuongId,
      chiTiet ? JSON.stringify(chiTiet).slice(0, 2000) : null,
      layIpThat(req),
    ]
  );
}
