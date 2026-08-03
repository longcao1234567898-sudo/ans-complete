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
  /* .trim() nằm TRONG hàm, không để nơi gọi tự làm.
     Vì sao quan trọng: vé xác thực ẩn danh được cấp bằng cách băm chuỗi IP
     (otp.js), rồi lúc gửi ý kiến lại băm lần nữa để đối chiếu
     (submissions.js). Hai nơi mà xử lý chuỗi khác nhau — một bên trim, một
     bên không — thì bản băm lệch nhau và vé vừa cấp xong đã không dùng được.
     Gom vào một chỗ là hết đường lệch. */
  return String(req?.ip || '').trim().slice(0, 45);
}
