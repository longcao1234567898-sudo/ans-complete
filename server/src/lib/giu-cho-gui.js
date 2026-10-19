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
 *
 * DEADLOCK KHI GỬI DỒN (BUG-038, đo P68 trên MySQL 8 thật): câu dọn chỗ hết hạn
 * (`WHERE het_han < ?` — khoá chỉ mục het_han rồi khoá chính) chạy đúng lúc lượt
 * khác trả chỗ (`WHERE khoa = ?` — khoá chính rồi chỉ mục): hai thứ tự khoá ngược
 * nhau, InnoDB huỷ một bên và ý kiến của người dân bị trả 500, mất luôn. Nay:
 *   · Dọn chung là việc PHỤ: lỗi của nó không làm hỏng lượt gửi, và chỉ dọn tối
 *     đa một lần mỗi DON_SAU_MS cho cả tiến trình — giữa đợt dồn bớt hẳn tranh khoá.
 *   · Gặp trùng khoá mà dòng kia ĐÃ HẾT HẠN thì dọn riêng đúng khoá đó rồi giữ lại
 *     (dọn chung thưa đi không được để chỗ bỏ rơi chặn người gửi).
 *   · Câu giữ / trả chỗ bị InnoDB huỷ vì deadlock thì thử lại vài lần. Trùng khoá
 *     (người khác đang giữ) KHÔNG thử lại — đó là tín hiệu giới hạn, giữ nguyên atomic.
 */
import crypto from 'node:crypto';

/** Một yêu cầu giữ chỗ tối đa bao lâu. Lâu hơn mọi lần xử lý một tin bình thường. */
export const HAN_GIU_MS = 60_000;

/* Tên khoá ở cột VARCHAR(80): cắt bớt phần băm, vẫn đủ dài để không trùng. */
const catKhoa = (loai, giaTri) => `${loai}:${String(giaTri).slice(0, 64)}`;

const thieuBang = (e) => e?.code === 'ER_NO_SUCH_TABLE' || e?.errno === 1146
  || /no such table|doesn't exist/i.test(String(e?.message || ''));
const trungKhoa = (e) => e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;
/* InnoDB huỷ câu lệnh để gỡ khoá chéo / chờ khoá quá lâu: chạy lại là được */
const keKhoa = (e) => e?.code === 'ER_LOCK_DEADLOCK' || e?.errno === 1213
  || e?.code === 'ER_LOCK_WAIT_TIMEOUT' || e?.errno === 1205;

/** Dọn chung chỗ hết hạn tối đa một lần mỗi khoảng này (cả tiến trình). */
export const DON_SAU_MS = 10_000;
const SO_LAN_THU = 3;
let lanDonCuoi = -Infinity;
/** Chỉ cho kiểm thử: quên lần dọn gần nhất */
export const datLaiChoThu = () => { lanDonCuoi = -Infinity; };

const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
/** Chạy lại khi bị InnoDB huỷ vì khoá; lỗi khác (kể cả trùng khoá) ném ngay */
async function thuLaiKhiKeKhoa(viec) {
  for (let lan = 1; ; lan += 1) {
    try {
      return await viec();
    } catch (e) {
      if (!keKhoa(e) || lan >= SO_LAN_THU) throw e;
      /* Chờ ngắn, lệch ngẫu nhiên: hai bên vừa kẹt nhau không lao vào lại cùng lúc */
      await ngu(10 * lan + Math.floor(Math.random() * 20));
    }
  }
}

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
      await thuLaiKhiKeKhoa(() => pool.query('DELETE FROM khoa_gui_tam WHERE khoa = ? AND chu = ?', [khoa, chu]))
        .catch((e) => console.warn('[giữ chỗ gửi] không trả được chỗ:', e.message));
    }
  };

  for (const [i, khoa] of dsKhoa.entries()) {
    const bayGio = Date.now();
    const giu = () => pool.query(
      'INSERT INTO khoa_gui_tam (khoa, chu, het_han) VALUES (?, ?, ?)',
      [khoa, chu, new Date(bayGio + HAN_GIU_MS)]
    );
    try {
      /* Dọn MỌI chỗ đã hết hạn, không riêng khoá này: máy chủ chết giữa chừng thì
         dòng giữ chỗ ở lại, mà dòng đó mang mã mạng và số điện thoại đã băm — không
         được để nó sống lâu hơn vòng đời dấu nối (BUG-014, lib/vong-doi-dau-noi.js).
         So bằng giờ của máy chủ ứng dụng ở cả lúc ghi lẫn lúc dọn, nên lệch giờ giữa
         máy ứng dụng và CSDL không ảnh hưởng.
         Thưa đi (BUG-038): giành lượt dọn TRƯỚC khi await để các yêu cầu đến cùng
         lúc không cùng dọn; lỗi của câu dọn chỉ ghi cảnh báo — trừ thiếu bảng,
         để nhánh "thiếu bảng" bên dưới xử lý như cũ. */
      if (i === 0 && bayGio - lanDonCuoi >= DON_SAU_MS) {
        lanDonCuoi = bayGio;
        await pool.query('DELETE FROM khoa_gui_tam WHERE het_han < ?', [new Date(bayGio)])
          .catch((e) => {
            if (thieuBang(e)) throw e;
            console.warn('[giữ chỗ gửi] dọn chỗ hết hạn không được (lượt sau dọn tiếp):', e.message);
          });
      }
      try {
        await thuLaiKhiKeKhoa(giu);
      } catch (e) {
        if (!trungKhoa(e)) throw e;
        /* Trùng khoá: nếu dòng kia đã hết hạn (bị bỏ rơi) thì dọn riêng đúng khoá
           đó rồi giữ lại MỘT lần. Còn hạn -> người khác đang giữ -> báo trùng như cũ.
           Hai yêu cầu cùng gặp một dòng hết hạn: chỉ một bên xoá được (affectedRows
           = 1) và giữ lại; bên kia nhận trùng — vẫn atomic nhờ khoá chính. */
        const [kq] = await thuLaiKhiKeKhoa(() => pool.query(
          'DELETE FROM khoa_gui_tam WHERE khoa = ? AND het_han < ?', [khoa, new Date(bayGio)]
        ));
        if (!(kq?.affectedRows > 0)) throw e;
        await thuLaiKhiKeKhoa(giu);
      }
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
