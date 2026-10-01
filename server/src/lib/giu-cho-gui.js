/**
 * GIỮ CHỖ GỬI TIN — làm cho giới hạn đếm thành atomic (luật 6, ADR-003 việc 1)
 * ============================================================================
 *
 * VÌ SAO: route gửi ý kiến kiểm "mạng/số điện thoại này đã gửi mấy tin" bằng
 * SELECT COUNT, rồi mất thêm hàng chục bước mới tới câu INSERT. Hai yêu cầu bắn
 * cùng lúc thì cả hai đều đếm thấy "chưa đủ" trước khi ai kịp ghi. Đo được: gửi
 * dồn 8 tin thì nhận đủ 8, vượt giới hạn 5 tin/giờ; 4 tin ẩn danh nhận đủ 4,
 * vượt giới hạn 2 tin/ngày.
 *
 * CÁCH LÀM: trước khi đếm, yêu cầu phải GIỮ ĐƯỢC CHỖ cho từng khoá của nó (mạng,
 * số điện thoại, nội dung). Giữ chỗ = chèn một dòng vào bảng có khoá chính là
 * khoá đó. Hai câu INSERT cùng khoá thì CSDL chỉ cho một câu thành công — phần
 * atomic nằm ở ràng buộc khoá chính, không nằm ở mã. Ai không giữ được thì trả
 * 429 ngay, không chờ: người thật không bao giờ gửi hai tin trong cùng một giây.
 *
 * VÌ SAO KHÔNG DÙNG GET_LOCK CỦA MYSQL: khoá đó gắn với một kết nối, phải giữ
 * riêng một kết nối suốt lúc xử lý tin. Bể kết nối chỉ có 10; một đợt gửi dồn
 * từ cùng một mạng sẽ giam hết kết nối chờ khoá, kéo sập cả trang cán bộ.
 * Bảng giữ chỗ chỉ cần những câu truy vấn ngắn như mọi câu khác.
 *
 * ĐÁNH ĐỔI ĐÃ CHẤP NHẬN:
 *   · Hai người khác nhau dùng chung một địa chỉ mạng (4G) bấm gửi đúng cùng
 *     một giây: người sau nhận 429 "thử lại sau vài giây". Hiếm, và thử lại là được.
 *   · Máy chủ chết giữa chừng: chỗ giữ tự hết hạn sau HAN_GIU_MS, không treo mãi.
 *   · Chưa chạy database/nang_cap_v25.sql (thiếu bảng): VẪN NHẬN TIN như trước
 *     bản vá, kèm cảnh báo lớn trong log. Chặn hết tin báo của người dân vì quên
 *     chạy một tệp nâng cấp là hại hơn để hở giới hạn chống tin rác.
 */
import crypto from 'node:crypto';

/** Một yêu cầu giữ chỗ tối đa bao lâu. Lâu hơn mọi lần xử lý một tin bình thường. */
export const HAN_GIU_MS = 60_000;

/* Tên khoá ở cột VARCHAR(80): cắt bớt phần băm, vẫn đủ dài để không trùng. */
const catKhoa = (loai, giaTri) => `${loai}:${String(giaTri).slice(0, 64)}`;

const thieuBang = (e) => e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146
  || /no such table|doesn't exist/i.test(String(e?.message || ''));
const trungKhoa = (e) => e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;

/**
 * Lập danh sách khoá cần giữ cho một lần gửi. Bỏ giá trị rỗng.
 * @param {{ ipHash?: string, phoneHash?: string|null, contentHash?: string }} p
 */
export function khoaCuaLanGui({ ipHash, phoneHash, contentHash }) {
  const ds = [];
  if (ipHash) ds.push(catKhoa('mang', ipHash));
  if (phoneHash) ds.push(catKhoa('sdt', phoneHash));
  if (contentHash) ds.push(catKhoa('noidung', contentHash));
  /* Sắp xếp để hai yêu cầu chung khoá luôn giữ theo cùng một thứ tự */
  return [...new Set(ds)].sort();
}

/**
 * Giữ chỗ cho mọi khoá. Được hết thì trả { ok: true, nha }. Hụt một khoá thì
 * trả lại những khoá đã giữ và báo { ok: false }.
 * `nha()` gọi bao nhiêu lần cũng được — gọi ngay sau INSERT, gọi thêm ở finally.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {string[]} dsKhoa
 */
export async function giuCho(pool, dsKhoa) {
  const chu = crypto.randomUUID();
  const daGiu = [];
  let daNha = false;

  const nha = async () => {
    if (daNha) return;
    daNha = true;
    for (const khoa of daGiu) {
      /* Chỉ xoá dòng của chính mình: chỗ đã hết hạn rồi bị người khác giữ lại
         thì dòng đó không còn là của mình nữa. */
      await pool.query('DELETE FROM khoa_gui_tam WHERE khoa = ? AND chu = ?', [khoa, chu])
        .catch((e) => console.warn('[giữ chỗ gửi] không trả được chỗ:', e.message));
    }
  };

  for (const [i, khoa] of dsKhoa.entries()) {
    const bayGio = Date.now();
    try {
      /* Dọn MỌI chỗ đã hết hạn (một lần mỗi lượt gửi), không riêng khoá này:
         máy chủ chết giữa chừng thì dòng giữ chỗ ở lại, mà dòng đó mang mã mạng
         và số điện thoại đã băm — không được để nó sống lâu hơn vòng đời dấu nối
         (BUG-014, lib/vong-doi-dau-noi.js). So bằng giờ của máy chủ ứng dụng ở cả
         lúc ghi lẫn lúc dọn, nên lệch giờ giữa máy ứng dụng và CSDL không ảnh hưởng. */
      if (i === 0) await pool.query('DELETE FROM khoa_gui_tam WHERE het_han < ?', [new Date(bayGio)]);
      await pool.query(
        'INSERT INTO khoa_gui_tam (khoa, chu, het_han) VALUES (?, ?, ?)',
        [khoa, chu, new Date(bayGio + HAN_GIU_MS)]
      );
      daGiu.push(khoa);
    } catch (e) {
      if (trungKhoa(e)) {
        await nha();
        return { ok: false, nha: async () => {} };
      }
      if (thieuBang(e)) {
        console.error('🔴 [giữ chỗ gửi] THIẾU BẢNG khoa_gui_tam — chạy database/nang_cap_v25.sql. '
          + 'Giới hạn gửi tin đang KHÔNG chống được gửi dồn cùng lúc.');
        await nha();
        return { ok: true, nha: async () => {}, thieuBang: true };
      }
      await nha();
      throw e;
    }
  }
  return { ok: true, nha };
}
