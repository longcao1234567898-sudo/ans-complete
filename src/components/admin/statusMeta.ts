/** Nhãn tiếng Việt + màu cho 4 trạng thái ý kiến */
export const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  received:   { label: 'Đã tiếp nhận', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dot: 'bg-blue-500' },
  processing: { label: 'Đang xử lý',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500' },
  resolved:   { label: 'Đã giải quyết',badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  rejected:   { label: 'Từ chối',      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', dot: 'bg-rose-500' },
};

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
