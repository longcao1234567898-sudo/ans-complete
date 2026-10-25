/**
 * GỬI LẠI CÙNG MỘT LẦN (P91) — mạng đứt lúc chờ trả lời thì gửi lại không thành đơn trùng
 * ============================================================================
 *
 * Giao diện tự gửi lại khi mạng chập chờn, khi có mạng trở lại (hàng chờ trên máy
 * — P92). Mạng đứt ĐÚNG lúc máy chủ đã lưu đơn mà chưa kịp trả lời thì trước đây
 * lần gửi lại bị chặn "nội dung vừa gửi": người dân mất mã tra cứu và PIN phòng
 * trao đổi (PIN chỉ trả một lần). Mỗi lần gửi mang `maLanGui` (UUID do trình
 * duyệt sinh, sống tới khi gửi được); bảng lan_gui_y_kien nhớ mã đó thành đơn nào.
 *
 * KHÔNG LỘ GÌ:
 *   · Chỉ lưu BĂM của mã, khác miền với mọi bảng khác — không nối được với gì.
 *   · Trả lại hồ sơ chỉ khi ĐÚNG mã VÀ ĐÚNG nội dung (băm nội dung khớp). Mã là
 *     UUID 122 bit chỉ trình duyệt người gửi biết; thêm điều kiện nội dung để mã
 *     có lọt ra cũng không dùng với nội dung khác được.
 *   · Lần gửi lại không đi qua cổng vé / giới hạn: nó không tạo gì mới, chỉ trả
 *     lại hồ sơ của chính người gửi (PIN mới thay PIN cũ chưa tới tay họ).
 *
 * ATOMIC (luật 6): giữ mã bằng INSERT khoá chính ngay trước khi lưu đơn — hai lần
 * gửi dồn cùng mã chỉ một lần giữ được. Lưu đơn hỏng thì trả mã ra để gửi lại được.
 *
 * Thiếu bảng (chưa chạy nang_cap_v40.sql): mọi hàm trả như "không có mã" — vẫn
 * nhận ý kiến, chỉ không nhận ra lần gửi lại (không bao giờ chặn tin vì tính năng này).
 */
import crypto from 'node:crypto';
import { hashIdentifier } from './crypto.js';

export const SONG_GIO = 24;
const DANG_MA = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Mã lần gửi hợp lệ (UUID v4, chỉ nhận chuỗi) -> chữ thường; không thì '' */
export function docMaLanGui(body) {
  const tho = body?.maLanGui;
  if (typeof tho !== 'string') return '';
  const ma = tho.trim().toLowerCase();
  return DANG_MA.test(ma) ? ma : '';
}

const bam = (ma) => hashIdentifier(`lan-gui:${ma}`).slice(0, 64);

let daBaoThieuBang = false;
function thieuBang(err) {
  if (err?.code !== 'ER_NO_SUCH_TABLE') return false;
  if (!daBaoThieuBang) {
    daBaoThieuBang = true;
    console.error('🔴 [gửi lại] thiếu bảng lan_gui_y_kien — chạy database/nang_cap_v40.sql (vẫn nhận ý kiến)');
  }
  return true;
}

/** Hồ sơ đã lưu từ ĐÚNG mã + ĐÚNG nội dung trong SONG_GIO giờ; không thì null */
export async function timLanGuiCu(pool, ma, contentHash) {
  if (!ma) return null;
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.tracking_code, s.is_anonymous, s.created_at
         FROM lan_gui_y_kien l JOIN submissions s ON s.id = l.submission_id
        WHERE l.khoa = ? AND s.content_hash = ? AND l.tao_luc > NOW() - INTERVAL ? HOUR`,
      [bam(ma), contentHash, SONG_GIO]
    );
    return rows[0] || null;
  } catch (err) {
    if (thieuBang(err)) return null;
    throw err;
  }
}

/**
 * Giữ mã ngay trước khi lưu đơn. true = giữ được (hoặc không có mã / thiếu bảng —
 * cứ lưu như thường); false = mã đang có lần gửi khác giữ.
 */
export async function giuMaLanGui(pool, ma) {
  if (!ma) return true;
  try {
    /* Dòng quá hạn của chính mã này không được làm kẹt lần gửi mới */
    await pool.query('DELETE FROM lan_gui_y_kien WHERE khoa = ? AND tao_luc <= NOW() - INTERVAL ? HOUR', [bam(ma), SONG_GIO]);
    await pool.query('INSERT INTO lan_gui_y_kien (khoa, submission_id, tao_luc) VALUES (?, NULL, NOW())', [bam(ma)]);
    if (crypto.randomInt(100) === 0) {
      pool.query('DELETE FROM lan_gui_y_kien WHERE tao_luc < NOW() - INTERVAL ? HOUR', [SONG_GIO * 2]).catch(() => {});
    }
    return true;
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') return false;
    if (thieuBang(err)) return true;
    throw err;
  }
}

/** Đơn đã lưu: ghi số đơn vào mã đã giữ */
export async function ganDon(pool, ma, submissionId) {
  if (!ma) return;
  await pool.query('UPDATE lan_gui_y_kien SET submission_id = ? WHERE khoa = ?', [submissionId, bam(ma)]);
}

/** Lưu đơn hỏng: trả mã ra (chỉ dòng chưa thành đơn) để lần gửi lại không bị kẹt */
export async function traMaLanGui(pool, ma) {
  if (!ma) return;
  await pool.query('DELETE FROM lan_gui_y_kien WHERE khoa = ? AND submission_id IS NULL', [bam(ma)])
    .catch((e) => console.warn('[gửi lại] không trả được mã:', e.message));
}
