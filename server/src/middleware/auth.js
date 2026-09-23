/** Middleware: yêu cầu đã đăng nhập. Gắn req.staff nếu token hợp lệ.
 *
 * ⚠️ KIỂM TRẠNG THÁI KHOÁ Ở MỖI YÊU CẦU — không chỉ kiểm chữ ký phiên.
 *
 * Lỗ hổng cũ: phiên truy cập sống 8 giờ, và lớp này chỉ kiểm chữ ký phiên chứ
 * không hỏi cơ sở dữ liệu. Nên khoá một tài khoản xong — kể cả đã thu hồi phiên
 * làm mới và chặn đăng nhập lại — người đó VẪN DÙNG TIẾP ĐƯỢC tới 8 tiếng bằng
 * phiên đang cầm. Một cán bộ bị khoá vì vi phạm vẫn xem được danh tính người
 * tố giác suốt buổi làm việc hôm đó.
 *
 * Nay mỗi yêu cầu hỏi lại cơ sở dữ liệu tài khoản còn hoạt động không.
 *
 * Bộ nhớ đệm 30 giây: không hỏi lại ở MỌI yêu cầu, vì mở một trang quản trị
 * phát ra cả chục yêu cầu cùng lúc. 30 giây đủ ngắn để việc khoá có hiệu lực
 * gần như tức thì, đủ dài để không làm chậm hệ thống.
 */
import { verifyAccessToken } from '../lib/token.js';
import { pool } from '../db.js';

const HAN_DEM_MS = 30_000;
const demTrangThai = new Map();   // staffId -> { conHoatDong, luc }

async function conHoatDong(staffId) {
  const d = demTrangThai.get(staffId);
  if (d && Date.now() - d.luc < HAN_DEM_MS) return d.conHoatDong;

  try {
    const [rows] = await pool.query('SELECT is_active FROM staff WHERE id = ?', [staffId]);
    const ok = rows.length > 0 && Boolean(rows[0].is_active);
    demTrangThai.set(staffId, { conHoatDong: ok, luc: Date.now() });
    return ok;
  } catch (err) {
    /* ⚠️ CƠ SỞ DỮ LIỆU HỎNG THÌ CHẶN, không cho qua.
       Cho qua khi không kiểm được là mở cửa cho tài khoản đã bị khoá. Cơ sở
       dữ liệu đã hỏng thì trang quản trị cũng không làm được gì, chặn luôn
       không mất gì thêm. */
    console.error('[auth] không kiểm được trạng thái tài khoản:', err.message);
    return false;
  }
}

/** Xoá bộ nhớ đệm của một tài khoản — gọi ngay sau khi khoá để có hiệu lực tức thì. */
export function xoaDemTrangThai(staffId) {
  if (staffId === undefined) demTrangThai.clear();
  else demTrangThai.delete(Number(staffId));
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }

  if (!(await conHoatDong(Number(payload.sub)))) {
    return res.status(401).json({ error: 'Tài khoản đã bị khoá. Liên hệ quản trị viên.' });
  }

  req.staff = { id: payload.sub, username: payload.username, role: payload.role, name: payload.name };
  next();
}
