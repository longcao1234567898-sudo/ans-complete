/** Nhãn tiếng Việt + màu cho 4 trạng thái ý kiến */
export const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  received:   { label: 'Đã tiếp nhận', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dot: 'bg-blue-500' },
  processing: { label: 'Đang xử lý',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' },
  resolved:   { label: 'Đã giải quyết',badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  rejected:   { label: 'Từ chối',      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', dot: 'bg-rose-500' },
};

/**
 * Nhãn huy hiệu trạng thái của MỘT tin phía cán bộ — ND-045.
 *
 * 'received' của tin có tên, không mang cờ, chưa vào thùng rác là "Chờ sàng
 * lọc" (ADR-003). Tin tố giác mật, ngoài thẩm quyền, ẩn danh cũng có thể mang
 * 'received' mà không nằm trong hàng sàng lọc — với chúng, và với mốc lịch sử,
 * nhãn vẫn là "Đã tiếp nhận" (STATUS_META). Điều kiện phải khớp
 * DANG_CHO_SANG_LOC ở server/src/lib/sang-loc.js:
 *   · máy chủ đã trả cờ dang_cho_sang_loc -> theo cờ đó;
 *   · không có cờ nhưng đủ hai cờ hồ sơ -> tự tính;
 *   · thiếu dữ liệu (vd danh sách "Ý kiến gần đây") -> nhãn chung, vì gắn
 *     "Chờ sàng lọc" sai cho tin tố giác mật còn tệ hơn để nhãn chung.
 */
export function nhanTrangThai(t: {
  status: string;
  dang_cho_sang_loc?: boolean;
  is_anonymous?: boolean | number;
  to_giac_mat?: boolean | number;
  ngoai_tham_quyen?: boolean | number;
  deleted_at?: string | null;
}): string {
  if (t.status === 'received') {
    const choSangLoc = typeof t.dang_cho_sang_loc === 'boolean'
      ? t.dang_cho_sang_loc
      : t.to_giac_mat !== undefined && t.ngoai_tham_quyen !== undefined
        && !Number(t.is_anonymous) && !Number(t.to_giac_mat) && !Number(t.ngoai_tham_quyen) && !t.deleted_at;
    if (choSangLoc) return 'Chờ sàng lọc';
  }
  return STATUS_META[t.status]?.label ?? t.status;
}

export const CATEGORY_LABEL: Record<string, string> = {
  to_giac: 'Tố giác tin báo',
  khieu_nai: 'Khiếu nại, tố cáo',
  phan_anh: 'Phản ánh, kiến nghị',
  de_xuat: 'Đề xuất, thắc mắc',
};

export function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
