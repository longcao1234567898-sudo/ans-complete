/**
 * VÉ CỔNG VÀO (ADR-003 việc 23) — vé máy chủ cấp sau bước xác minh "không phải
 * người máy" khi vào web. Gửi kèm mỗi lần gửi tin, đăng nhập; máy chủ kiểm.
 *
 * Cất ở sessionStorage: đóng trình duyệt là mất — máy dùng chung (tiệm net,
 * máy kiosk) thì người sau phải tự xác minh lại. Hạn ghi kèm chỉ để giao diện
 * biết lúc nào cần hiện lại màn hình xác minh; máy chủ mới là nơi kiểm hạn thật.
 */
const KHOA = 'htans_ve_vao_cua';
/** Sự kiện phát ra khi máy chủ báo vé hết hạn — màn hình cổng vào nghe để hiện lại */
export const SU_KIEN_CAN_XAC_MINH = 'htans-can-xac-minh';

export function layVe(): string {
  try {
    const tho = sessionStorage.getItem(KHOA);
    if (!tho) return '';
    const { ve, hetHan } = JSON.parse(tho) as { ve: string; hetHan: number };
    return typeof ve === 'string' && hetHan > Date.now() ? ve : '';
  } catch {
    return '';
  }
}

export function luuVe(ve: string, soGio: number) {
  try {
    /* Trừ 5 phút để không gửi một vé sắp hết hạn giữa chừng */
    sessionStorage.setItem(KHOA, JSON.stringify({ ve, hetHan: Date.now() + soGio * 3_600_000 - 300_000 }));
  } catch { /* trình duyệt chặn bộ nhớ: lần sau xác minh lại */ }
}

/** Máy chủ trả CAN_XAC_MINH -> bỏ vé, báo màn hình cổng vào hiện lại */
export function veHetHan() {
  try { sessionStorage.removeItem(KHOA); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event(SU_KIEN_CAN_XAC_MINH));
}
