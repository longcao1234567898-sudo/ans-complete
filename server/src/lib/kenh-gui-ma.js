/**
 * KÊNH GỬI MÃ XÁC MINH SỐ ĐIỆN THOẠI — Zalo (ZNS) / SMS (P86)
 * ============================================================================
 *
 * Khai bằng biến môi trường, theo thứ tự thử:
 *     KENH_XAC_MINH_SDT=zalo,sms     # Zalo trước (rẻ hơn), không gửi được thì SMS
 *     KENH_XAC_MINH_SDT=sms          # chỉ SMS
 *     (để trống)                     # TẮT — không gửi mã, gửi ý kiến vẫn bình thường
 *
 * Mỗi nhà cung cấp là một bộ kết nối riêng, tự đăng ký bằng dangKyKenh(ten, ...)
 * (vd lib/kenh/esms.js khi đã chọn nhà cung cấp). Tên không có bộ kết nối thì
 * TẮT cả tính năng và báo lỗi lúc khởi động — không âm thầm bỏ qua kênh đó, kẻo
 * tưởng đang gửi Zalo mà thật ra không gửi gì (luật 1).
 *
 * Kênh "thu": chỉ cho máy cá nhân (NODE_ENV=development/test) — không gửi đi đâu,
 * trả mã trong câu trả lời để lập trình viên bấm thử. Mọi máy khác bị TỪ CHỐI:
 * trả mã ra màn hình là ai cũng "xác minh" được số của người khác.
 *
 * NỘI DUNG TIN NHẮN CỐ Ý TRUNG TÍNH: không có chữ "Công an", "tố giác", "phản
 * ánh". Tin hiện trên màn hình điện thoại — người nhà, người mượn máy, hay chính
 * kẻ bị tố cầm máy đều đọc được. Không dấu: tin SMS có dấu tính giá gấp đôi.
 */

export const NOI_DUNG_MA = (ma, phut) =>
  `Ma xac nhan cua ban: ${ma}. Het han sau ${phut} phut. Khong chia se ma nay cho bat ky ai.`;

const BO_KET_NOI = new Map();

/**
 * Bộ kết nối một nhà cung cấp. `guiMa({ soDienThoai, noiDung })` trả
 * `{ ok: true }` khi nhà cung cấp đã NHẬN gửi, `{ ok: false, lyDo }` khi không.
 * Không được ném lỗi chứa số điện thoại hay nội dung ra nhật ký.
 */
export function dangKyKenh(ten, boKetNoi) {
  BO_KET_NOI.set(ten, boKetNoi);
}

dangKyKenh('thu', { guiMa: async () => ({ ok: true }) });

const TEN_HOP_LE = /^[a-z][a-z0-9_]{0,19}$/;

/** Đọc cấu hình kênh. { bat, danhSach, lyDo } — bat=false kèm lý do để báo. */
export function cauHinhKenh(env = process.env) {
  const tho = String(env.KENH_XAC_MINH_SDT || '').trim();
  if (!tho) return { bat: false, danhSach: [], lyDo: 'chưa khai KENH_XAC_MINH_SDT (tính năng tắt)' };
  const danhSach = tho.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const ten of danhSach) {
    if (!TEN_HOP_LE.test(ten) || !BO_KET_NOI.has(ten)) {
      return { bat: false, danhSach: [], lyDo: `kênh "${ten}" chưa có bộ kết nối — TẮT gửi mã` };
    }
  }
  /* Allow-list: chỉ máy GHI RÕ là máy cá nhân/máy test mới dùng kênh thử. Quên
     đặt NODE_ENV trên máy thật thì vẫn bị chặn (không so "khác production"). */
  if (danhSach.includes('thu') && !['development', 'test'].includes(env.NODE_ENV)) {
    return { bat: false, danhSach: [], lyDo: 'kênh "thu" trả mã ra màn hình — chỉ dùng khi NODE_ENV=development/test' };
  }
  return { bat: true, danhSach, lyDo: '' };
}

/**
 * Gửi lần lượt theo thứ tự khai; kênh đầu tiên nhận gửi thì dừng.
 *
 * `truocMoiKenh(thuTu)` chạy TRƯỚC mỗi lần thử một kênh — để route trừ trần tin
 * cho TỪNG tin có thể bị tính tiền (Zalo từ chối rồi sang SMS là hai lượt).
 * Trả false thì dừng (đã chạm trần).
 *
 * Chỉ chuyển kênh khi kênh trước TỪ CHỐI RÕ RÀNG ({ ok: false }). Kênh ném lỗi
 * (hết giờ, đứt mạng) là mập mờ — nhà cung cấp có thể đã nhận và tính tiền —
 * nên dừng luôn, không gửi thêm tin thứ hai.
 *
 * Trả { ok, kenh } khi gửi được; { ok: false, lyDo: 'het_tran' | 'map_mo' | 'tu_choi' }.
 */
export async function guiQuaKenh(danhSach, { soDienThoai, noiDung }, truocMoiKenh = async () => true) {
  for (let i = 0; i < danhSach.length; i++) {
    const ten = danhSach[i];
    const bo = BO_KET_NOI.get(ten);
    if (!bo) continue;
    if (!(await truocMoiKenh(i))) return { ok: false, lyDo: 'het_tran' };
    let kq;
    try {
      kq = await bo.guiMa({ soDienThoai, noiDung });
    } catch (err) {
      console.error(`[gửi mã] kênh ${ten} lỗi, không thử kênh sau (có thể đã tính tiền):`, String(err?.message || err).slice(0, 120));
      return { ok: false, lyDo: 'map_mo' };
    }
    if (kq?.ok) return { ok: true, kenh: ten };
  }
  return { ok: false, lyDo: 'tu_choi' };
}
