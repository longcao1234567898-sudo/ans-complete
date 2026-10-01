/**
 * TIN ĐANG Ở PHẦN NÀO (ADR-003) — một chỗ quy đổi để menu bên trái và nút
 * "Quay lại" ở trang chi tiết luôn chỉ đúng phần chứa tin.
 *
 * Vì sao cần: trang chi tiết của MỌI tin nằm ở /quan-tri/y-kien/:id, nên menu
 * so đường dẫn thì lúc nào cũng sáng "Tin đưa vào xử lý" — mở một tin ở hàng
 * sàng lọc, hay một tin ngoài thẩm quyền, cán bộ tưởng tin đã bị chuyển đi.
 * Thứ tự kiểm khớp lib/sang-loc.js ở máy chủ: cờ chỉ-lãnh-đạo đứng trước.
 */

export const DUONG_PHAN = {
  sang_loc: '/quan-tri/sang-loc',
  xu_ly: '/quan-tri/y-kien',
  to_giac: '/quan-tri/to-giac',
  to_giac_mat: '/quan-tri/to-giac-mat',
  ngoai_tham_quyen: '/quan-tri/ngoai-tham-quyen',
} as const;

export const TEN_DUONG: Record<string, string> = {
  '/quan-tri/sang-loc': 'Sàng lọc',
  '/quan-tri/kiem-duyet': 'Chờ duyệt ẩn danh',
  '/quan-tri/y-kien': 'Tin đưa vào xử lý',
  '/quan-tri/to-giac': 'Tin tố giác',
  '/quan-tri/to-giac-mat': 'Tin tố giác mật',
  '/quan-tri/ngoai-tham-quyen': 'Ngoài thẩm quyền',
  '/quan-tri/thung-rac': 'Thùng rác',
};

/** Chỉ nhận đường của một phần đã biết (state trên lịch sử trình duyệt sửa tay được) */
export const laDuongPhan = (v: unknown): v is string =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEN_DUONG, v);

interface TinToiThieu {
  status: string;
  deleted_at?: string | null;
  to_giac_mat?: number | boolean | null;
  ngoai_tham_quyen?: number | boolean | null;
  dang_cho_sang_loc?: boolean;
  category_code?: string | null;
}

/** Đường danh sách của phần đang chứa tin */
export function duongPhanCuaTin(t: TinToiThieu): string {
  if (t.deleted_at) return '/quan-tri/thung-rac';
  if (Number(t.to_giac_mat)) return DUONG_PHAN.to_giac_mat;
  if (Number(t.ngoai_tham_quyen)) return DUONG_PHAN.ngoai_tham_quyen;
  if (t.dang_cho_sang_loc) return DUONG_PHAN.sang_loc;
  if (t.status === 'pending_review') return '/quan-tri/kiem-duyet';
  if (t.category_code === 'to_giac') return DUONG_PHAN.to_giac;
  return DUONG_PHAN.xu_ly;
}
