/**
 * Dịch vụ BẢN ĐỒ AN NINH CÔNG KHAI — dành cho người dân, không cần đăng nhập.
 *
 * Dữ liệu ở đây đã được máy chủ làm mờ có chủ đích: chỉ có tên địa bàn, toạ độ
 * trung tâm, tổng số tin và phân bố theo nhóm việc. Không có nội dung tin,
 * không có danh tính, không có toạ độ vụ việc cụ thể.
 */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';

export interface DiaBanAnNinh {
  id: number;
  ten: string;
  lat: number;
  lng: number;
  /** Địa bàn có quá ít tin -> máy chủ CHE SỐ để không lộ người báo */
  duLieuIt: boolean;
  /** null khi duLieuIt = true */
  tong: number | null;
  nhom: {
    to_giac: number;
    khieu_nai: number;
    phan_anh: number;
    de_xuat: number;
  } | null;
}

export interface BanDoAnNinh {
  ngay: number;
  nguongChe: number;
  diaBan: DiaBanAnNinh[];
}

export async function fetchBanDoAnNinh(ngay = 30): Promise<BanDoAnNinh> {
  if (!API_URL) throw new Error('Chưa cấu hình địa chỉ máy chủ');
  const res = await fetch(`${API_URL}/api/ban-do?ngay=${ngay}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Chưa xem được bản đồ lúc này');
  }
  return res.json();
}
