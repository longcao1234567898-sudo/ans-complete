/**
 * Dịch vụ THỐNG KÊ — số liệu hoạt động của hệ thống.
 *
 * ⚠️ Việc ghi nhận lượt truy cập KHÔNG gửi bất kỳ thông tin nhận dạng nào.
 *    Chỉ gửi đúng một cờ "đây có phải phiên mới không", tính bằng một dấu nhớ
 *    trong bộ nhớ phiên của trình duyệt — mất khi đóng tab, không truy ngược
 *    được về người nào.
 */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

export interface ThongKeHeThong {
  tongYKien: number;
  yKienDaXuLy: number;
  luotTruyCap: number;
  khachHomNay: number;
  ngayHoatDong: number;
}

const KHOA_PHIEN = 'ans_da_ghi_nhan_phien';

/**
 * Ghi nhận một lượt mở trang.
 *
 * Gọi một lần khi ứng dụng khởi động. Lỗi thì im lặng bỏ qua — đếm lượt truy
 * cập hỏng không được phép làm hỏng việc đọc trang của bà con.
 */
export function ghiNhanTruyCap(): void {
  if (!API_URL) return;
  let laKhachMoi = false;
  try {
    /* sessionStorage mất khi đóng tab, nên mỗi phiên làm việc đếm đúng một
       khách. Dùng localStorage thì sẽ chỉ đếm một lần mãi mãi. */
    if (!sessionStorage.getItem(KHOA_PHIEN)) {
      sessionStorage.setItem(KHOA_PHIEN, '1');
      laKhachMoi = true;
    }
  } catch {
    /* Trình duyệt chặn lưu trữ (chế độ riêng tư) -> coi như khách mới. */
    laKhachMoi = true;
  }

  fetch(`${API_URL}/api/thong-ke/ghi-nhan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ laKhachMoi }),
    keepalive: true,
  }).catch(() => { /* im lặng */ });
}

export async function fetchThongKe(): Promise<ThongKeHeThong> {
  if (!API_URL) throw new Error('Chưa cấu hình địa chỉ máy chủ');
  const res = await fetch(`${API_URL}/api/thong-ke`);
  if (!res.ok) throw new Error('Chưa lấy được số liệu');
  return res.json();
}
