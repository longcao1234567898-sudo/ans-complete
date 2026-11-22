/** Xác thực cán bộ: đăng nhập, làm mới token, đăng xuất, xem thông tin bản thân */
import { Router } from 'express';
import { layIpThat, ghiNhatKy, khoaIp } from '../lib/helpers.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { quaCongVao } from '../lib/cong-vao.js';
import { requireAuth } from '../middleware/auth.js';
import {
  signAccessToken, generateRefreshToken, hashRefreshToken,
} from '../lib/token.js';

const router = Router();

/* HASH GIẢ để so sánh khi KHÔNG tìm thấy tài khoản — chống dò tên đăng nhập
   bằng cách đo thời gian phản hồi.

   ⚠️ PHẢI LÀ BCRYPT THẬT, HỢP LỆ. Bản trước dùng chuỗi tự gõ
   '$2a$12$0000...' — chỉ dài 59 ký tự, sai định dạng, nên bcrypt.compare()
   phát hiện hỏng và trả về false NGAY LẬP TỨC (~0.4ms) thay vì tính toán
   ~200ms như với hash thật. Kết quả: sai-tên-tài-khoản trả lời nhanh hơn hẳn
   sai-mật-khẩu -> kẻ tấn công đo thời gian là liệt kê được tài khoản nào có
   thật, đúng thứ mà lớp phòng thủ này sinh ra để ngăn.

   Sinh lúc nạp module: tốn ~200ms một lần duy nhất, đổi lại luôn đúng định
   dạng và luôn khớp chi phí (cost) với hash thật trong database. */
export const DUMMY_HASH = bcrypt.hashSync('khong-bao-gio-trung-mat-khau-that', 12);

// Chống dò mật khẩu: tối đa 5 lần đăng nhập / 15 phút / IP
const loginLimiter = rateLimit({
  keyGenerator: (req) => khoaIp(req),   // IPv6 gom /64 (P87)
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 15 phút.' },
});

/* LỖI ĐÃ SỬA: trước đây dùng `secure: process.env.NODE_ENV === 'production'`.
   Nhưng Render KHÔNG tự đặt biến NODE_ENV, nên nó luôn undefined -> cờ secure
   luôn FALSE ngay cả khi chạy thật. Hậu quả: vé đăng nhập của cán bộ có thể
   bị gửi qua kết nối HTTP không mã hoá.

   Cách sửa: mặc định BẬT secure, chỉ tắt khi chạy ở máy cá nhân (localhost).
   Nguyên tắc: an toàn là mặc định, nới lỏng phải khai báo tường minh. */
const CHAY_O_MAY_CA_NHAN =
  (process.env.CLIENT_URL || '').includes('localhost') ||
  (process.env.CLIENT_URL || '').includes('127.0.0.1');

const COOKIE_OPTS = {
  httpOnly: true,                    // JavaScript không đọc được -> chống XSS đánh cắp vé
  secure: !CHAY_O_MAY_CA_NHAN,       // BẬT mặc định, chỉ tắt khi chạy localhost
  sameSite: 'lax',
  maxAge: 30 * 86400_000,            // 30 ngày
  path: '/api/auth',
};

/* CHỐNG DÒ MẬT KHẨU — KHÔNG KHOÁ TÀI KHOẢN

   VÌ SAO KHÔNG KHOÁ:
   Khoá tài khoản nghe có vẻ an toàn nhưng lại tạo ra lỗ hổng khác nguy hiểm
   hơn: kẻ xấu chỉ cần cố ý gõ sai liên tục là KHOÁ ĐƯỢC cán bộ thật ra khỏi
   hệ thống. Cứ hết hạn khoá lại gõ sai tiếp — cán bộ vĩnh viễn không vào được.
   Với hệ thống tiếp nhận tin báo khẩn cấp, hậu quả đó nặng hơn cả việc bị dò
   mật khẩu.

   CÁCH LÀM THAY THẾ — BẮT XÁC MINH CAPTCHA:
   Sai từ 3 lần trở lên thì yêu cầu qua ô "Tôi không phải người máy".
     - Máy tự động dò mật khẩu -> KHÔNG vượt được captcha -> bị chặn
     - Cán bộ thật -> tích một cái là vào được ngay, KHÔNG bị khoá
   Bảo vệ đúng thứ cần bảo vệ mà không tạo cửa phá hoại mới. */
const SO_LAN_SAI_BAT_CAPTCHA = 3;

/* ĐẾM LẦN SAI THEO TÊN ĐÃ GÕ, KHÔNG THEO TÀI KHOẢN (BUG-054).

   Trước: chỉ tài khoản CÓ THẬT có bộ đếm (staff.failed_attempts), tên không có thật luôn 0 —
   cùng một chuỗi thao tác cho ra phản hồi khác nhau (canCaptcha ở lần sai thứ 3, lời "tích vào ô
   xác minh" ở lần thứ 4), kẻ dò biết tên nào là cán bộ thật. Nay đếm theo tên đã gõ (cắt khoảng
   trắng, chữ thường — MySQL so tên không phân biệt hoa thường) trong dem_gioi_han, NHƯ NHAU cho
   tên có và không có. Câu tăng là một câu (luật 6).

   Cửa sổ TRƯỢT 30 ngày: mỗi lần sai đẩy hạn ra thêm 30 ngày, nên bộ đếm chỉ về 0 khi đăng nhập
   đúng hoặc 30 ngày liền không ai gõ sai tên đó. Bộ đếm cũ không bao giờ tự về 0 — đây là nới
   nhỏ đã chấp nhận: kẻ dò được thêm 3 lần thử sau MỖI 30 ngày im lặng, đổi lại bảng không giữ mãi
   tên rác người ta gõ. Lưu bản băm của tên, không lưu tên. */
const GIAY_NHO_LAN_SAI = 30 * 86400;

/* KHOÁ BỘ ĐẾM tính từ tenChuan (xem chỗ tra tài khoản ở /login — BUG-056, BUG-057). gopTen gộp
   THÊM dấu, ký tự định dạng, vài chữ ghép: chỉ làm các cách viết na ná cộng chung một bộ đếm
   (bắt ô xác minh sớm hơn). An toàn không dựa vào việc gộp này đủ hay thiếu: cùng tenChuan thì
   cùng khoá, và chỉ đúng tenChuan mới vào được tài khoản. */
function gopTen(ten) {
  return String(ten).normalize('NFKD').replace(/[\p{M}\p{Cf}]/gu, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ı/g, 'i')
    .replace(/\s+/g, ' ').trim();
}
const khoaLanSai = (ten) => 'dang-nhap-sai:'
  + crypto.createHash('sha256').update(gopTen(ten)).digest('hex');

/* GIÀNH LƯỢT TRƯỚC KHI SO MẬT KHẨU (BUG-052 lần 2, luật 6). Mỗi lượt đăng nhập TĂNG bộ đếm trước,
   rồi đọc lại để biết mình là lần thử thứ mấy; đúng mật khẩu thì xoá bộ đếm. Trước đây đọc số lần
   sai -> so bcrypt (~200 ms) -> mới tăng: N lượt song song cùng đọc thấy "chưa tới 3", cùng được so
   mật khẩu không qua ô xác minh (RETEST đo: 12 lượt thì 6 lọt). Đọc lại sau khi tăng có thể thấy cả
   lượt song song khác -> đếm DƯ, bắt ô xác minh sớm hơn: phía an toàn.
   Gán `so` TRƯỚC `het_han`: phép so het_han <= NOW() đọc hạn CŨ (như lib/dem-gioi-han.js). */
async function giuLanThu(ten) {
  const khoa = khoaLanSai(ten);
  await pool.query(
    `INSERT INTO dem_gioi_han (khoa, so, het_han) VALUES (?, 1, NOW() + INTERVAL ? SECOND)
     ON DUPLICATE KEY UPDATE so = CASE WHEN het_han <= NOW() THEN 1 ELSE so + 1 END,
                             het_han = NOW() + INTERVAL ? SECOND`,
    [khoa, GIAY_NHO_LAN_SAI, GIAY_NHO_LAN_SAI]
  );
  const [rows] = await pool.query('SELECT so FROM dem_gioi_han WHERE khoa = ?', [khoa]);
  return Number(rows[0]?.so || 1);
}

/** Ghi vết mọi lần đăng nhập thất bại — để phát hiện tấn công đang diễn ra */
async function ghiThatBai(staffId, username, ip) {
  try {
    await pool.query(
      `INSERT INTO staff_activity_logs (staff_id, action, ip_address, attempted_username)
       VALUES (?, 'login_failed', ?, ?)`,
      [staffId, ip, String(username || '').slice(0, 50)]
    );
  } catch {
    /* Bảng chưa nâng cấp v9 -> bỏ qua, KHÔNG làm hỏng luồng đăng nhập.
       Ghi nhật ký hỏng không được cản người dùng hợp lệ vào hệ thống. */
  }
}

/** POST /api/auth/login */
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  /* Chỉ nhận chuỗi, có trần độ dài: mảng/đối tượng làm bcryptjs ném lỗi -> 500 (BUG-054) */
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password
      || username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  }

  try {
    const ip = (layIpThat(req) || '').trim();
    /* Lần đăng nhập SAI ghi KHOÁ MẠNG (IPv6 gom /64): màn hình cảnh báo dò mật
       khẩu (admin/logs.js /canh-bao) gom theo cột này — ghi địa chỉ đầy đủ thì kẻ
       dò đổi địa chỉ trong cùng dải là không bao giờ hiện cảnh báo (rà soát P87). */
    const ipKhoa = khoaIp(req);

    /* CỔNG VÀO (ADR-003 việc 23): vé xác minh "không phải người máy" lấy khi
       vào trang. Kiểm TRƯỚC khi đụng tới tài khoản — máy dò mật khẩu gọi thẳng
       API thì dừng ở đây, không tốn một lần so bcrypt nào. Ô xác minh sau
       nhiều lần sai (bên dưới) vẫn giữ: vé sống vài giờ, dò mật khẩu cần chặn
       riêng theo tài khoản. */
    const cong = await quaCongVao(req.body, ip);
    if (!cong.ok) return res.status(403).json({ error: cong.error, code: cong.code });

    /* TÊN CHUẨN — MỘT chuỗi dùng cho CẢ việc tra tài khoản LẪN khoá bộ đếm lần sai (BUG-057).
       Tra bằng LOWER(username) so TỪNG BYTE (utf8mb4_bin) với tên đã cắt khoảng trắng, NFC, chữ
       thường — KHÔNG để collation utf8mb4_unicode_ci của cột quyết định. Collation đó coi 'cánbo9',
       'canbo9' + U+0001, 'canbo٩'… là một với 'canbo9': mỗi cách viết vào được tài khoản mà bộ đếm
       lại khác (BUG-056), và mọi lần bắt chước collation bằng JavaScript đều hụt một nhóm ký tự —
       chỗ hụt làm tên có thật và tên không có phản hồi khác nhau (BUG-057, RETEST đo trên MariaDB).
       Nay hai chuỗi gõ vào được cùng một tài khoản thì CHẮC CHẮN cùng tenChuan, nên cùng bộ đếm;
       và đường đi giống hệt cho tên có và tên không có. Vẫn không phân biệt hoa thường. */
    const tenChuan = username.trim().normalize('NFC').toLowerCase();

    /* Lấy thêm failed_attempts và locked_until. Dùng COALESCE để vẫn chạy
       được khi database chưa nâng cấp v9 — không làm sập đăng nhập. */
    let staff;
    try {
      const [rows] = await pool.query(
        `SELECT id, full_name, username, password_hash, role, is_active,
                COALESCE(failed_attempts, 0) AS failed_attempts, locked_until
         FROM staff WHERE LOWER(username) = ? COLLATE utf8mb4_bin`,
        [tenChuan]
      );
      staff = rows[0];
    } catch {
      // Chưa chạy v9 -> dùng truy vấn cũ
      const [rows] = await pool.query(
        'SELECT id, full_name, username, password_hash, role, is_active FROM staff WHERE LOWER(username) = ? COLLATE utf8mb4_bin',
        [tenChuan]
      );
      staff = rows[0];
    }

    /* ĐÃ SAI NHIỀU LẦN -> BẮT QUA CAPTCHA (không khoá tài khoản). Đếm theo TÊN ĐÃ GÕ, như nhau
       cho tên có thật và không có (BUG-054) — không đọc staff.failed_attempts ở đây. */
    const soLanThu = await giuLanThu(tenChuan);         // BUG-052 lần 2: giành lượt TRƯỚC
    const soLanSaiHienTai = soLanThu - 1;               // số lần sai trước lượt này
    if (soLanSaiHienTai >= SO_LAN_SAI_BAT_CAPTCHA) {
      const kq = await verifyTurnstile(req.body?.captchaToken, ip);
      if (!kq.ok) {
        await ghiThatBai(staff?.id ?? null, username, ipKhoa);
        return res.status(401).json({
          error: 'Vui lòng tích vào ô xác minh "Tôi không phải là người máy" rồi đăng nhập lại.',
          canCaptcha: true,   // báo giao diện hiện ô captcha
        });
      }
    }

    // Luôn so sánh bcrypt kể cả khi không tìm thấy user -> chống dò tài khoản qua thời gian phản hồi
    const ok = await bcrypt.compare(password, staff?.password_hash || DUMMY_HASH);

    if (!staff || !ok) {
      // GHI VẾT — trước đây chỉ ghi lần đăng nhập THÀNH CÔNG, nên không
      // phát hiện được khi hệ thống đang bị dò mật khẩu.
      await ghiThatBai(staff?.id ?? null, username, ipKhoa);
      /* Bộ đếm theo tên đã tăng ở giuLanThu — không tăng lần nữa */

      /* staff.failed_attempts: giữ để ghi nhận theo tài khoản. Lớp CHẶN là bộ đếm theo tên đã gõ
         ở trên (BUG-054) — cũng không theo IP, kẻ đổi IP vẫn không vượt được. */
      const soLanSai = soLanThu;
      if (staff) {
        /* TĂNG TRONG CSDL, không ghi đè số đã đọc (BUG-052, luật 6): đọc ở trên rồi so bcrypt
           ~80 ms mới ghi, nên N lần sai song song cùng đọc một số cũ, cùng ghi "cũ + 1" —
           bộ đếm chỉ tăng 1, kẻ dò nhiều IP lách được ngưỡng bắt ô xác minh. */
        try {
          await pool.query('UPDATE staff SET failed_attempts = COALESCE(failed_attempts, 0) + 1 WHERE id = ?',
            [staff.id]);
        } catch { /* chưa nâng cấp v9 -> bỏ qua */ }
      }

      // Thông báo GIỐNG NHAU cho sai tên và sai mật khẩu -> không lộ tài khoản nào có thật.
      // Kèm cờ báo giao diện hiện ô captcha cho lần thử sau.
      return res.status(401).json({
        error: 'Tên đăng nhập hoặc mật khẩu không đúng.',
        canCaptcha: soLanSai >= SO_LAN_SAI_BAT_CAPTCHA,
      });
    }

    if (!staff.is_active) {
      await ghiThatBai(staff.id, username, ipKhoa);
      return res.status(403).json({ error: 'Tài khoản đã bị khoá.' });
    }

    // Đăng nhập đúng -> xoá bộ đếm sai (cả bộ đếm theo tên đã gõ, BUG-054)
    await pool.query('DELETE FROM dem_gioi_han WHERE khoa = ?', [khoaLanSai(tenChuan)]);
    try {
      await pool.query(
        'UPDATE staff SET failed_attempts = 0 WHERE id = ?',
        [staff.id]
      );
    } catch { /* chưa nâng cấp v9 -> bỏ qua */ }

    // Cấp access token + refresh token
    const accessToken = signAccessToken(staff);
    const { raw, hash, expiresAt } = generateRefreshToken();
    await pool.query(
      'INSERT INTO refresh_tokens (staff_id, token_hash, expires_at) VALUES (?,?,?)',
      [staff.id, hash, expiresAt]
    );
    await pool.query('UPDATE staff SET last_login = NOW() WHERE id = ?', [staff.id]);
    await pool.query(
      'INSERT INTO staff_activity_logs (staff_id, action, ip_address) VALUES (?,?,?)',
      [staff.id, 'login', ip]
    );

    res.cookie('refreshToken', raw, COOKIE_OPTS);
    res.json({
      accessToken,
      staff: { id: staff.id, name: staff.full_name, username: staff.username, role: staff.role },
    });
  } catch (err) {
    console.error('Lỗi đăng nhập:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ khi đăng nhập.' });
  }
});

/** POST /api/auth/refresh — dùng refresh token trong cookie lấy access token mới */
router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (!raw) return res.status(401).json({ error: 'Không có phiên đăng nhập.' });

  try {
    const hash = hashRefreshToken(raw);
    const [rows] = await pool.query(
      `SELECT rt.id, rt.expires_at, s.id AS staff_id, s.full_name, s.username, s.role, s.is_active
       FROM refresh_tokens rt JOIN staff s ON s.id = rt.staff_id
       WHERE rt.token_hash = ? AND rt.revoked = FALSE`,
      [hash]
    );
    const row = rows[0];
    if (!row || new Date(row.expires_at) < new Date() || !row.is_active) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' });
    }
    const accessToken = signAccessToken({
      id: row.staff_id, full_name: row.full_name, username: row.username, role: row.role,
    });
    res.json({
      accessToken,
      staff: { id: row.staff_id, name: row.full_name, username: row.username, role: row.role },
    });
  } catch (err) {
    console.error('Lỗi refresh:', err.message);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** POST /api/auth/logout — thu hồi refresh token */
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.refreshToken;
  if (raw) {
    try {
      const bam = hashRefreshToken(raw);
      /* Đăng xuất không đi qua requireAuth (mã truy cập có thể đã hết hạn) —
         biết là ai nhờ phiên đăng nhập còn sống trong refresh_tokens */
      const [phien] = await pool.query(
        'SELECT staff_id FROM refresh_tokens WHERE token_hash = ? AND revoked = FALSE', [bam]
      );
      await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = ?', [bam]);
      if (phien.length > 0) {
        await ghiNhatKy(pool, req, { hanhDong: 'logout', staffId: phien[0].staff_id });
      }
    } catch { /* bỏ qua */ }
  }
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ ok: true });
});

/** GET /api/auth/me — thông tin cán bộ đang đăng nhập */
router.get('/me', requireAuth, (req, res) => res.json({ staff: req.staff }));

export default router;
