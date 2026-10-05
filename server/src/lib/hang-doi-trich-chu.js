/**
 * HÀNG ĐỢI TRÍCH CHỮ TỆP ĐÍNH KÈM (P52, ADR-005)
 * ============================================================================
 *
 * Việc nằm trong bảng trich_chu_tep (nang_cap_v33.sql), không nằm trong bộ nhớ:
 * máy chủ khởi động lại thì việc dở vẫn còn đó.
 *
 *   · CHỈ CÁN BỘ yêu cầu mới có việc (routes/admin/trich-chu.js). Người dân gửi
 *     tin KHÔNG kích OCR — không cho người ngoài đẩy việc nặng vào máy chủ.
 *   · Giành việc bằng UPDATE ... WHERE trang_thai = 'cho' rồi xem affectedRows
 *     (luật 6): hai tiến trình cùng đọc một hàng đợi không làm trùng một tệp.
 *   · Việc "đang làm" quá 15 phút là của một lần chạy đã chết (khởi động lại,
 *     tiến trình con bị giết) -> trả về hàng chờ.
 *   · Tệp lấy từ CSDL (base64) hoặc từ kho ảnh Cloudinary CỦA ĐƠN VỊ — địa chỉ ảnh
 *     kiểm lại bằng đúng hàm đã kiểm lúc nhận tin, không theo chuyển hướng.
 */
import { pool } from '../db.js';
import { trichChu } from './trich-chu/index.js';
import { dangTim } from './chuan-hoa-van-ban.js';
import { kiemTraLinkCloudinary } from './anh-an-toan.js';

export { NGON_NGU_OCR } from './trich-chu/index.js';

/** Tệp lớn nhất đem đi trích (tài liệu tối đa 10MB, ảnh tối đa 8MB lúc nhận) */
const BYTE_TOI_DA = 15 * 1024 * 1024;
const MIME_ANH_KHO = new Set(['image/jpeg', 'image/png', 'image/webp']);

let coBang = false;
/** Đã chạy nang_cap_v33.sql chưa. Chỉ nhớ khi CÓ — chạy SQL xong không cần khởi động lại. */
export async function coBangTrichChu() {
  if (coBang) return true;
  try {
    await pool.query('SELECT tep_id FROM trich_chu_tep LIMIT 0');
    coBang = true;
  } catch {
    coBang = false;
  }
  return coBang;
}

/** Chỉ cho kiểm thử: CSDL giả đổi giữa các bài, máy thật không bao giờ mất bảng */
export const quenBangTrichChu = () => { coBang = false; };

const laTrung = (e) => e?.code === 'ER_DUP_ENTRY';

/**
 * Xếp việc cho các tệp của một hồ sơ (hoặc một tệp). Tệp đã có dòng thì bỏ qua,
 * trừ khi `lai` (trích lại — có thể kèm ngôn ngữ OCR cán bộ chọn).
 * Trả số việc mới vào hàng chờ.
 */
export async function xepViec(submissionId, { tepId = null, ngonNgu = null, lai = false, staffId = null }) {
  let so = 0;
  if (tepId !== null && lai) {
    const [r] = await pool.query(
      `UPDATE trich_chu_tep SET trang_thai = 'cho', ngon_ngu = ?, yeu_cau_boi = ?, cap_nhat_luc = NOW()
        WHERE tep_id = ? AND submission_id = ? AND trang_thai IN ('xong', 'loi')`,
      [ngonNgu, staffId, tepId, submissionId]
    );
    so += r.affectedRows;
  }
  try {
    const [r] = tepId === null
      ? await pool.query(
        `INSERT INTO trich_chu_tep (tep_id, submission_id, trang_thai, ngon_ngu, yeu_cau_boi)
         SELECT i.id, i.submission_id, 'cho', ?, ? FROM submission_images i
          WHERE i.submission_id = ?
            AND NOT EXISTS (SELECT 1 FROM trich_chu_tep t WHERE t.tep_id = i.id)`,
        [ngonNgu, staffId, submissionId]
      )
      : await pool.query(
        `INSERT INTO trich_chu_tep (tep_id, submission_id, trang_thai, ngon_ngu, yeu_cau_boi)
         SELECT i.id, i.submission_id, 'cho', ?, ? FROM submission_images i
          WHERE i.submission_id = ? AND i.id = ?
            AND NOT EXISTS (SELECT 1 FROM trich_chu_tep t WHERE t.tep_id = i.id)`,
        [ngonNgu, staffId, submissionId, tepId]
      );
    so += r.affectedRows;
  } catch (e) {
    /* Hai cán bộ bấm cùng lúc: khoá duy nhất tep_id chặn dòng trùng — việc đã có */
    if (!laTrung(e)) throw e;
  }
  return so;
}

/**
 * Địa chỉ ảnh trong kho Cloudinary CỦA ĐƠN VỊ — kiểm lại bằng hàm đã kiểm lúc nhận
 * tin. Chưa khai CLOUDINARY_CLOUD_NAME thì không biết kho nào là của mình -> không lấy.
 */
export function urlKhoAnh(url) {
  const kho = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(kho)) throw new Error('Chưa khai CLOUDINARY_CLOUD_NAME trên máy chủ — không lấy được ảnh từ kho.');
  const kq = kiemTraLinkCloudinary({ url }, kho);
  if (kq.trangThai !== 'safe') throw new Error(`Không lấy ảnh: ${kq.lyDo}`);
  return String(url);
}

async function layByte(tep) {
  const url = String(tep.image_url || '');
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([\w.+/-]+);base64,/);
    if (!m) throw new Error('Tệp lưu sai dạng.');
    if ((url.length - m[0].length) * 0.75 > BYTE_TOI_DA) throw new Error('Tệp quá lớn để trích chữ.');
    return { mime: String(tep.mime_type || m[1]).toLowerCase(), duLieu: Buffer.from(url.slice(m[0].length), 'base64') };
  }
  const r = await fetch(urlKhoAnh(tep.image_url), {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Kho ảnh trả mã ${r.status}.`);
  const loai = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MIME_ANH_KHO.has(loai)) throw new Error('Kho ảnh trả về không phải ảnh.');
  if (Number(r.headers.get('content-length')) > BYTE_TOI_DA) throw new Error('Ảnh quá lớn để trích chữ.');
  const duLieu = Buffer.from(await r.arrayBuffer());
  if (duLieu.length > BYTE_TOI_DA) throw new Error('Ảnh quá lớn để trích chữ.');
  return { mime: loai, duLieu };
}

async function lamMotViec(viec) {
  const [[tep]] = await pool.query(
    'SELECT image_url, mime_type, storage FROM submission_images WHERE id = ?',
    [viec.tep_id]
  );
  if (!tep) {
    await pool.query('DELETE FROM trich_chu_tep WHERE id = ?', [viec.id]);
    return;
  }
  try {
    const { mime, duLieu } = await layByte(tep);
    const kq = await trichChu({ mime, duLieu, ngonNgu: viec.ngon_ngu || null });
    await pool.query(
      `UPDATE trich_chu_tep
          SET trang_thai = 'xong', phuong_phap = ?, noi_dung = ?, noi_dung_tim = ?, do_tin_cay = ?,
              so_trang = ?, ngon_ngu_dung = ?, da_chuyen_tcvn3 = ?, ghi_chu = ?, cap_nhat_luc = NOW()
        WHERE id = ?`,
      [kq.phuongPhap, kq.noiDung, dangTim(kq.noiDung), kq.doTinCay ?? null, kq.soTrang ?? null,
        kq.ngonNgu ?? null, kq.daChuyenTcvn3 ? 1 : 0, kq.ghiChu ?? null, viec.id]
    );
  } catch (e) {
    await pool.query(
      `UPDATE trich_chu_tep
          SET trang_thai = 'loi', noi_dung = NULL, noi_dung_tim = NULL, ghi_chu = ?, cap_nhat_luc = NOW()
        WHERE id = ?`,
      [String(e?.message || 'Không trích được chữ.').slice(0, 500), viec.id]
    );
  }
}

async function motVong() {
  await pool.query(
    `UPDATE trich_chu_tep SET trang_thai = 'cho'
      WHERE trang_thai = 'dang_lam' AND cap_nhat_luc < NOW() - INTERVAL 15 MINUTE`
  );
  for (let n = 0; n < 1000; n += 1) {
    const [[viec]] = await pool.query(
      "SELECT id, tep_id, ngon_ngu FROM trich_chu_tep WHERE trang_thai = 'cho' ORDER BY id LIMIT 1"
    );
    if (!viec) return;
    const [r] = await pool.query(
      "UPDATE trich_chu_tep SET trang_thai = 'dang_lam', cap_nhat_luc = NOW() WHERE id = ? AND trang_thai = 'cho'",
      [viec.id]
    );
    if (r.affectedRows !== 1) continue; // tiến trình khác vừa giành
    await lamMotViec(viec);
  }
}

let lanChay = null;
let goiLai = false;
/**
 * Chạy hàng đợi tới khi hết việc. Gọi khi đang chạy thì chỉ hẹn chạy thêm một
 * vòng (việc vừa xếp lúc vòng cũ sắp xong không bị bỏ sót). Trả lời hứa của lượt chạy.
 */
export function chayHangDoi() {
  if (lanChay) { goiLai = true; return lanChay; }
  lanChay = (async () => {
    do {
      goiLai = false;
      try {
        await motVong();
      } catch (e) {
        console.warn('[trích chữ] hàng đợi dừng:', e.message);
      }
    } while (goiLai);
  })().finally(() => { lanChay = null; });
  return lanChay;
}
