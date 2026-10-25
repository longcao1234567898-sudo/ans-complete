/**
 * GỬI LẠI CÙNG MỘT LẦN (P91) — mạng đứt lúc chờ trả lời thì gửi lại không thành đơn trùng
 * ============================================================================
 *
 * Giao diện tự gửi lại khi mạng chập chờn, khi có mạng trở lại (hàng chờ trên máy
 * — P92). Mạng đứt ĐÚNG lúc máy chủ đã lưu đơn mà chưa kịp trả lời thì trước đây
 * lần gửi lại bị chặn "nội dung vừa gửi": người dân mất mã tra cứu và PIN phòng
 * trao đổi (PIN chỉ trả một lần). Mỗi lần gửi mang `maLanGui` (UUID v4 do trình
 * duyệt sinh, đi theo đúng một bản đơn tới khi gửi được).
 *
 * THIẾT KẾ (bản 2 — trọng tài P91 tìm 5 lỗi ở bản 1 dùng bảng giữ mã riêng):
 *   · Băm mã nằm NGAY TRONG dòng đơn (cột UNIQUE lan_gui_bam), ghi bằng chính câu
 *     INSERT đơn: đơn và mã cùng có hoặc cùng không — không còn "mã giữ mà đơn chưa
 *     lưu" bị kẹt 24 giờ khi CSDL rớt / tiến trình chết giữa chừng.
 *   · PIN phòng trao đổi của đơn có mã = HMAC(pepper, mã): gửi lại trả ĐÚNG PIN đã
 *     cấp, không đặt PIN mới — PIN người dân đã chép không bao giờ mất hiệu lực, và
 *     đường gửi lại không chạy scrypt, không UPDATE (không đóng giờ lên updated_at).
 *     Không đoán được: mã là UUID 122 bit chỉ trình duyệt người gửi biết, pepper là
 *     bí mật máy chủ.
 *   · DẤU VÂN của cả lần gửi (ẩn danh hay không, nhóm, nội dung, danh tính, địa
 *     bàn, vị trí, tệp) lưu ở lan_gui_dau. Cùng mã mà lệch dấu vân -> 409, KHÔNG trả
 *     mã tra cứu: không báo "đã nhận" cho một thứ khác với cái đã lưu (vd lần đầu có
 *     tên, lần sau ẩn danh; lần sau thêm tệp).
 *
 * KHÔNG LỘ GÌ: chỉ lưu băm HMAC (khác miền "lan-gui:" / "lan-gui-dau:"); băm là của
 * một mã ngẫu nhiên dùng một lần, không nối được với gì. Bộ dọn dấu nối xoá hai cột
 * sau SONG_GIO giờ (lib/vong-doi-dau-noi.js).
 *
 * Thiếu cột (chưa chạy nang_cap_v40.sql): coi như không có mã — vẫn nhận ý kiến,
 * chỉ không nhận ra lần gửi lại (không bao giờ chặn tin vì tính năng này).
 */
import { hashIdentifier } from './crypto.js';
import { sha256 } from './helpers.js';

export const SONG_GIO = 24;
const DANG_MA = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Mã lần gửi hợp lệ (UUID v4, chỉ nhận chuỗi) -> chữ thường; không thì '' */
export function docMaLanGui(body) {
  const tho = body?.maLanGui;
  if (typeof tho !== 'string') return '';
  const ma = tho.trim().toLowerCase();
  return DANG_MA.test(ma) ? ma : '';
}

export const bamMaLanGui = (ma) => hashIdentifier(`lan-gui:${ma}`);

/** PIN 6 số cố định theo mã — cùng mã luôn ra cùng PIN */
export function pinTuMaLanGui(ma) {
  const n = parseInt(hashIdentifier(`lan-gui-pin:${ma}`).slice(0, 12), 16);
  return String(100000 + (n % 900000));
}

/* Mỗi phần tử tệp băm riêng (ảnh base64 vài MB) rồi mới gộp */
const bamTep = (ds) => (Array.isArray(ds) ? ds.map((t) => sha256(typeof t === 'string' ? t : JSON.stringify(t ?? null))) : null);

/**
 * Dấu vân của mọi thứ có nghĩa trong lần gửi. KHÔNG gồm các vé / mã đổi giữa hai
 * lần thử (vé vào cửa, mã Turnstile, phiếu mở form, vé xác minh số, mã máy).
 */
export function dauVanLanGui(body) {
  const b = body || {};
  const anDanh = b.isAnonymous === true;
  const phan = [
    anDanh, b.category ?? null, b.content ?? null, b.normalizedContent ?? null,
    anDanh ? null : [b.fullName ?? null, b.phone ?? null, b.email ?? null],
    b.wardId ?? null, b.viTri ?? null, bamTep(b.images), bamTep(b.taiLieu),
  ];
  return hashIdentifier(`lan-gui-dau:${sha256(JSON.stringify(phan))}`);
}

let coCot = false;
/** Đã chạy nang_cap_v40.sql chưa. Chỉ nhớ khi CÓ — chạy SQL xong không cần khởi động lại */
export async function coCotLanGui(pool) {
  if (coCot) return true;
  try {
    await pool.query('SELECT lan_gui_bam, lan_gui_dau FROM submissions LIMIT 0');
    coCot = true;
  } catch { /* chưa chạy v40 */ }
  return coCot;
}

/** Đơn đã lưu từ mã này trong SONG_GIO giờ (kèm dấu vân để so); không thì null */
export async function timDonTheoMaLanGui(pool, bam) {
  const [rows] = await pool.query(
    `SELECT id, tracking_code, is_anonymous, created_at, lan_gui_dau FROM submissions
      WHERE lan_gui_bam = ? AND created_at > NOW() - INTERVAL ? HOUR`,
    [bam, SONG_GIO]
  );
  return rows[0] || null;
}

/** Băm cũ QUÁ HẠN của đúng mã này — gỡ trước khi lưu đơn mới mang cùng mã */
export async function xoaMaLanGuiCu(pool, bam) {
  await pool.query(
    `UPDATE submissions SET lan_gui_bam = NULL, lan_gui_dau = NULL, updated_at = updated_at
      WHERE lan_gui_bam = ? AND created_at <= NOW() - INTERVAL ? HOUR`,
    [bam, SONG_GIO]
  );
}

/** Lỗi trùng khoá có phải do cột mã lần gửi không (MySQL ghi tên chỉ mục, SQLite tên cột) */
export const trungMaLanGui = (err) => err?.code === 'ER_DUP_ENTRY'
  && /lan_gui_bam/.test(String(err.sqlMessage || err.message || ''));

/**
 * Bộ dọn dấu nối gọi định kỳ: xoá băm mã + dấu vân quá SONG_GIO giờ.
 * updated_at = updated_at: không đóng giờ dọn lên đơn (bài học P29). Thiếu cột -> 0.
 */
export async function xoaMaLanGuiQuaHan(pool) {
  if (!(await coCotLanGui(pool))) return 0;
  const [kq] = await pool.query(
    `UPDATE submissions SET lan_gui_bam = NULL, lan_gui_dau = NULL, updated_at = updated_at
      WHERE lan_gui_bam IS NOT NULL AND created_at < NOW() - INTERVAL ? HOUR`,
    [SONG_GIO]
  );
  return kq?.affectedRows || 0;
}
