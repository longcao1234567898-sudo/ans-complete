/**
 * TỆP ĐÍNH KÈM CỦA HỒ SƠ ĐÃ XOÁ DANH TÍNH (BUG-029)
 * ============================================================================
 *
 * Xoá danh tính chỉ xoá được các cột tên, số điện thoại, email… Còn đơn Word,
 * PDF, ảnh CCCD người dân gửi kèm thường mang chính họ tên, chữ ký, ảnh mặt họ.
 * Người vận hành chọn CHE chứ không xoá sạch (P55): tệp có thể là chứng cứ.
 *
 *   · Hồ sơ đã xoá danh tính: trang chi tiết không trả tệp nào cho BẤT KỲ AI —
 *     che sẵn như danh tính. Chỉ lãnh đạo mở được, bằng một lần bấm riêng, ghi
 *     nhật ký TRƯỚC (ADR-003: nhật ký là thứ duy nhất để lãnh đạo kiểm lẫn nhau).
 *   · Chữ trích từ tệp (P52) là bản sao nội dung tệp — che y như tệp.
 *   · Lãnh đạo xoá hẳn được từng tệp chỉ chứa danh tính, kể cả bản trên kho ảnh
 *     Cloudinary. Chưa xoá được bản trên kho thì KHÔNG xoá ở CSDL và KHÔNG báo
 *     đã xoá (luật 1): xoá dòng trong CSDL mà ảnh còn trên kho là mất luôn dấu
 *     để xoá tay, trong khi link ảnh vẫn mở được từ Internet.
 *
 * Đánh đổi đã chấp nhận: lãnh đạo vẫn xem được tệp chứa danh tính của người đã
 * xin xoá — giữ chứng cứ cho vụ việc. Bù lại: phải bấm riêng, mỗi lần đều có
 * nhật ký, và người dân được nói thật điều này lúc xin xoá.
 */
import { createHash } from 'node:crypto';
import { pool } from '../db.js';
import { kiemTraLinkCloudinary } from './anh-an-toan.js';

/** Hồ sơ `id` đã xoá danh tính chưa. Không thấy hồ sơ -> coi như đã xoá (che, luật 1). */
export async function hoSoDaXoaDanhTinh(id) {
  const [r] = await pool.query('SELECT COALESCE(identity_erased, 0) AS xoa FROM submissions WHERE id = ?', [id]);
  return r.length === 0 ? true : Number(r[0].xoa) === 1;
}

/** Số tệp đang bị che của hồ sơ — để trang chi tiết nói "có N tệp", không nói tệp gì */
export async function demTep(id) {
  const [[r]] = await pool.query('SELECT COUNT(*) AS n FROM submission_images WHERE submission_id = ?', [id]);
  return Number(r?.n ?? 0);
}

/** Lỗi phía kho ảnh — câu lỗi đưa thẳng cho lãnh đạo đọc, không bao giờ chứa khoá */
export class LoiKhoAnh extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

/**
 * Mã ảnh trên kho LẤY TỪ ĐƯỜNG DẪN ĐÃ KIỂM — không tin cột cloudinary_id: cột đó do
 * trình duyệt người gửi tự khai. Tin nó thì kẻ xấu gửi tin giả kèm ảnh của mình nhưng
 * khai mã ảnh chứng cứ của hồ sơ khác, xin xoá danh tính, nhờ lãnh đạo "xoá ảnh căn
 * cước" -> máy ký lệnh xoá chứng cứ kia bằng khoá của đơn vị (trọng tài P55).
 *
 * Chỉ nhận đúng dạng đường dẫn Cloudinary trả về lúc tải lên:
 *   https://res.cloudinary.com/<kho>/<image|video>/upload/v<số>/<mã ảnh>.<đuôi>
 * Có biến đổi (w_300...), kiểu giao authenticated/private, raw, có ?query, mã có dấu
 * chấm -> không nhận: tính sai mã ảnh thì kho báo "không có" và máy sẽ báo nhầm "đã xoá".
 * @returns {null | {loai: 'image'|'video', maAnh: string}}
 */
export function maAnhTuDuongDan(duongDan, kho) {
  let u;
  try { u = new URL(String(duongDan)); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com' || u.search || u.hash || u.username) return null;
  const m = /^\/([A-Za-z0-9_-]+)\/(image|video)\/upload\/v[0-9]{1,12}\/([A-Za-z0-9_\-/]{1,255})\.[A-Za-z0-9]{1,5}$/.exec(u.pathname);
  if (!m || m[1] !== kho) return null;
  if (m[3].split('/').some((p) => p === '')) return null;
  return { loai: m[2], maAnh: m[3] };
}

/** URL lệnh xoá trên kho của đơn vị: host cố định; tên kho và loại đã kiểm trước khi gọi */
export function urlXoaKhoAnh({ kho, loai }) {
  return `https://api.cloudinary.com/v1_1/${kho}/${loai}/destroy`;
}

/**
 * Lên kế hoạch xoá bản trên kho — KHÔNG gọi mạng. Kiểm cấu hình, kho, mã ảnh trước
 * để lỗi hiện ra trước khi ghi nhật ký "xoá" (nhật ký không ghi việc chắc chắn không
 * làm được).
 * @returns {null | {kho: string, loai: string, maAnh: string, body: URLSearchParams}} null = tệp không nằm trên kho
 */
export function keHoachXoaKho(tep) {
  if (tep.storage !== 'cloudinary') return null;
  const kho = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const khoa = (process.env.CLOUDINARY_API_KEY || '').trim();
  const biMat = (process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(kho) || !/^[0-9]{5,30}$/.test(khoa) || biMat.length < 10) {
    throw new LoiKhoAnh('Máy chủ chưa khai đủ CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET '
      + '— chưa xoá được bản trên kho ảnh nên chưa xoá tệp. Khai đủ rồi thử lại, hoặc xoá tay trên Cloudinary.', 503);
  }
  if (kiemTraLinkCloudinary({ url: tep.image_url }, kho).trangThai !== 'safe') {
    throw new LoiKhoAnh('Ảnh không nằm trong kho ảnh của đơn vị (CLOUDINARY_CLOUD_NAME) — máy chủ không xoá được, '
      + 'cần xoá tay ở kho đang giữ ảnh.', 409);
  }
  const anh = maAnhTuDuongDan(tep.image_url, kho);
  if (!anh) {
    throw new LoiKhoAnh('Đường dẫn ảnh không đúng dạng ảnh công khai của kho — máy không tự xoá (dễ báo nhầm). '
      + 'Cần xoá tay trên Cloudinary.', 409);
  }
  if (tep.cloudinary_id && String(tep.cloudinary_id) !== anh.maAnh) {
    throw new LoiKhoAnh('Mã ảnh lưu trong hồ sơ không khớp đường dẫn ảnh — nghi bị khai sai, máy không xoá. '
      + 'Báo quản trị kiểm tra trước khi xoá tay.', 409);
  }
  /* Chữ ký Cloudinary: tham số xếp theo bảng chữ cái, nối &, thêm khoá bí mật, băm SHA-1.
     Khoá bí mật chỉ vào phép băm — không bao giờ đi trên đường truyền. */
  const timestamp = String(Math.floor(Date.now() / 1000));
  const thamSo = { invalidate: 'true', public_id: anh.maAnh, timestamp };
  const chuoi = Object.keys(thamSo).sort().map((k) => `${k}=${thamSo[k]}`).join('&');
  const signature = createHash('sha1').update(chuoi + biMat).digest('hex');
  return { kho, loai: anh.loai, maAnh: anh.maAnh, body: new URLSearchParams({ ...thamSo, api_key: khoa, signature }) };
}

/**
 * Ảnh này còn chỗ khác dùng không: tệp khác (hồ sơ nào cũng tính, kể cả cùng hồ sơ) hay
 * tin tức. Cùng một ảnh có nhiều đường dẫn (số phiên bản, đuôi tệp khác) — tìm rộng bằng
 * LIKE theo mã ảnh rồi lọc lại; dòng nào không đọc được mã thì coi như trùng (luật 1).
 */
export async function anhConNoiKhacDung(tepId, maAnh) {
  const kho = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  /* maAnh chỉ gồm chữ, số, _ - / — "_" là ký tự đại diện của LIKE nên tìm rộng hơn; lọc lại bên dưới */
  const mau = `%/${maAnh}.%`;
  const trung = (url, ma) => ma === maAnh || (() => {
    const a = maAnhTuDuongDan(url, kho);
    return a ? a.maAnh === maAnh : String(url ?? '').includes(`/${maAnh}.`);
  })();
  const [tep] = await pool.query(
    'SELECT id, image_url, cloudinary_id FROM submission_images WHERE id <> ? AND (cloudinary_id = ? OR image_url LIKE ?)',
    [tepId, maAnh, mau]
  );
  if (tep.some((t) => trung(t.image_url, t.cloudinary_id))) return true;
  try {
    const [tin] = await pool.query('SELECT image_url FROM news WHERE image_url LIKE ?', [mau]);
    if (tin.some((t) => trung(t.image_url, null))) return true;
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  return false;
}

/** Thực hiện kế hoạch. 'da_xoa' | 'khong_con' (đã không còn trên kho) — còn lại ném LoiKhoAnh. */
export async function thucHienXoaKho(keHoach) {
  let r;
  try {
    r = await fetch(urlXoaKhoAnh(keHoach), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: keHoach.body,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LoiKhoAnh('Không kết nối được kho ảnh — chưa xoá tệp. Thử lại sau.');
  }
  let kq = null;
  try { kq = await r.json(); } catch { /* để kq null */ }
  if (r.ok && kq?.result === 'ok') return 'da_xoa';
  if (r.ok && kq?.result === 'not found') return 'khong_con';
  throw new LoiKhoAnh(`Kho ảnh từ chối xoá (mã ${r.status}) — chưa xoá tệp. Kiểm khoá API Cloudinary rồi thử lại.`);
}
