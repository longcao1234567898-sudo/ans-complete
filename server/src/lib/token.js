/**
 * Quản lý JWT: access token (ngắn hạn) + refresh token (dài hạn, lưu DB, thu hồi được).
 */
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

/* ============================================================================
   KHOÁ KÝ PHIÊN ĐĂNG NHẬP

   ⚠️ TRƯỚC ĐÂY DÒNG NÀY LÀ:
        const JWT_SECRET = process.env.JWT_SECRET || 'doi-secret-nay-trong-file-env';

   Giá trị dự phòng đó nằm trong mã nguồn, mà kho mã nguồn lại để công khai.
   Nếu máy chủ chạy mà quên đặt biến JWT_SECRET, hệ thống vẫn khởi động bình
   thường — nhưng bất kỳ ai đọc được mã nguồn đều tự ký được một token hợp lệ
   với role 'admin' và vào thẳng trang quản trị. Không cần mật khẩu, không để
   lại dấu vết đăng nhập nào.

   Nguy hiểm hơn nữa: file render.yaml KHÔNG khai báo biến JWT_SECRET. Ai dựng
   lại dịch vụ từ file đó sẽ chạy đúng vào tình huống trên mà không hay biết.

   NAY: thiếu khoá thì MÁY CHỦ KHÔNG KHỞI ĐỘNG. Cùng nguyên tắc an toàn khi
   hỏng đã áp dụng cho khoá mã hoá danh tính — thà không chạy còn hơn chạy mà
   mở toang cửa quản trị.
   ============================================================================ */
export const JWT_SECRET = (() => {
  const s = (process.env.JWT_SECRET || '').trim();

  if (!s) {
    throw new Error(
      'THIẾU JWT_SECRET.\n' +
      '   Máy chủ không khởi động vì thiếu khoá ký phiên đăng nhập.\n' +
      '   Không có khoá này, bất kỳ ai cũng tự tạo được token quản trị.\n' +
      '   → Đặt biến JWT_SECRET trên Render (chuỗi ngẫu nhiên 64 ký tự hex).\n' +
      '   → Sinh khoá: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (s.length < 32) {
    throw new Error(
      `JWT_SECRET quá ngắn (${s.length} ký tự), cần tối thiểu 32.\n` +
      '   Khoá ngắn dò ra được bằng máy tính thông thường.'
    );
  }

  /* Chặn chuỗi dự phòng cũ và các chuỗi hay bị điền tạm rồi quên đổi.
     Dùng "có chứa" chứ không so khớp chính xác — nếu không thì chỉ cần thêm
     vài ký tự vào cuối là lọt qua. */
  const CAM = ['doi-secret-nay-trong-file-env', 'changeme', 'jwt-secret',
               'your-secret', 'my-secret', 'secretkey'];
  const thap = s.toLowerCase();
  const trung = CAM.find((c) => thap.includes(c));
  if (trung) {
    throw new Error(
      `JWT_SECRET chứa chuỗi mặc định "${trung}" — giá trị này nằm công khai\n` +
      '   trong mã nguồn nên ai cũng giả mạo được token quản trị.\n' +
      '   → Thay bằng chuỗi ngẫu nhiên 64 ký tự hex.'
    );
  }

  /* Kiểm tra độ ngẫu nhiên.
     Danh sách cấm chỉ chặn được thứ đã biết trước. Một chuỗi như
     "aaaaaaaa...aaaa" đủ 64 ký tự vẫn lọt qua mọi kiểm tra ở trên, nhưng dò
     ra trong vài giây. Đếm số ký tự KHÁC NHAU là cách đơn giản mà hiệu quả:
     chuỗi ngẫu nhiên thật luôn có nhiều ký tự khác nhau, chuỗi gõ tay thì ít. */
  const soKyTuKhacNhau = new Set(s).size;
  if (soKyTuKhacNhau < 8) {
    throw new Error(
      `JWT_SECRET chỉ có ${soKyTuKhacNhau} ký tự khác nhau — quá dễ đoán.\n` +
      '   Chuỗi lặp như "aaaa..." tuy dài nhưng dò ra trong vài giây.\n' +
      '   → Sinh khoá: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return s;
})();

const ACCESS_TTL = '8h';        // access token sống 8 giờ
const REFRESH_TTL_DAYS = 30;    // refresh token sống 30 ngày

/** Sinh access token chứa thông tin cán bộ */
export function signAccessToken(staff) {
  return jwt.sign(
    { sub: staff.id, username: staff.username, role: staff.role, name: staff.full_name },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

/** Xác minh access token — ném lỗi nếu sai/hết hạn.
 *
 * ⚠️ GHIM CỨNG algorithms: ['HS256'].
 * Không ghim thì jwt.verify chấp nhận mọi thuật toán token tự khai trong phần
 * header "alg". Thư viện v9 đã chặn alg:none mặc định, nhưng để trống vẫn là
 * đường mở: nếu sau này ai đổi sang khoá bất đối xứng (RS256) mà quên ghim,
 * kẻ tấn công ép token về HS256 rồi ký bằng chính public key (vốn công khai) —
 * chiếm quyền quản trị mà không cần biết khoá bí mật. Ghim ngay từ đầu để cửa
 * đó không bao giờ mở, kể cả khi đổi loại khoá về sau. */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

/** Sinh refresh token ngẫu nhiên (lưu hash vào DB) */
export function generateRefreshToken() {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  return { raw, hash, expiresAt };
}

/** Hash một refresh token thô để so với DB */
export function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
