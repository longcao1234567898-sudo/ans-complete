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
