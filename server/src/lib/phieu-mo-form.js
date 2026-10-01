/**
 * PHIẾU MỞ FORM — đo thời gian điền đơn ở MÁY CHỦ (ADR-003 việc 24)
 * ============================================================================
 *
 * Lúc người dân mở trang gửi ý kiến, máy chủ cấp một phiếu có chữ ký (JWT, ghi
 * giờ cấp `iat`). Lúc gửi, máy chủ tự tính giây = bây giờ − iat. Giờ do trình
 * duyệt tự báo thì máy tự động sửa được, nên KHÔNG đọc trường thời gian nào
 * người gửi đưa lên.
 *
 * Kết quả chỉ để GẮN CỜ, không từ chối: tin nghi máy vẫn vào hàng sàng lọc,
 * cán bộ thấy cờ và lý do. Chặn hẳn thì người gõ nhanh, người dán sẵn nội dung
 * soạn từ trước bị chặn oan — mà đó có thể là một tố giác thật.
 *
 * NGƯỠNG 15 giây cho cả 5 bước là con số ban đầu theo kế hoạch; đo lại từ thời
 * gian điền thật của người dân sau vài tuần chạy rồi chỉnh.
 */
import jwt from 'jsonwebtoken';

export const NGUONG_GIAY = 15;
const MUC_DICH = 'mo_form';
const HAN_PHIEU = '1d';

export function capPhieuMoForm() {
  return jwt.sign({ purpose: MUC_DICH }, process.env.JWT_SECRET, { expiresIn: HAN_PHIEU });
}

const docThoiGian = (giay) => (giay >= 60 ? `${Math.floor(giay / 60)} phút ${giay % 60} giây` : `${giay} giây`);

/**
 * @returns {{ nghiMay: boolean, ghiChu: string, giay: number | null }}
 */
export function danhGiaThoiGianDien(phieu) {
  if (typeof phieu !== 'string' || !phieu) {
    return { nghiMay: true, giay: null, ghiChu: 'Không có phiếu mở form — nghi gọi thẳng máy chủ, không qua trang gửi ý kiến' };
  }
  let p;
  try {
    p = jwt.verify(phieu, process.env.JWT_SECRET);
  } catch {
    return { nghiMay: true, giay: null, ghiChu: 'Phiếu mở form không hợp lệ hoặc đã hết hạn' };
  }
  if (p.purpose !== MUC_DICH || !Number.isFinite(p.iat)) {
    return { nghiMay: true, giay: null, ghiChu: 'Phiếu mở form không hợp lệ' };
  }
  const giay = Math.max(0, Math.floor(Date.now() / 1000) - p.iat);
  if (giay < NGUONG_GIAY) {
    return { nghiMay: true, giay, ghiChu: `Điền xong trong ${docThoiGian(giay)} (ngưỡng ${NGUONG_GIAY} giây) — nghi máy tự động` };
  }
  return { nghiMay: false, giay, ghiChu: '' };
}
