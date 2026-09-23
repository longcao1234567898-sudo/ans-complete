/**
 * NutNgonNgu — nút chuyển giữa Tiếng Việt và English.
 *
 * Đặt cạnh nút chế độ tối ở đầu trang, và trong menu điện thoại.
 *
 * ⚠️ HIỆN NGÔN NGỮ SẼ CHUYỂN SANG, không hiện ngôn ngữ đang dùng. Người nước
 *    ngoài nhìn thấy chữ "English" thì biết bấm vào sẽ ra tiếng Anh. Hiện chữ
 *    "Tiếng Việt" lúc đang ở tiếng Việt thì họ không đoán được nút làm gì.
 */
import { Languages } from 'lucide-react';
import { useNgonNgu } from '../../i18n/useNgonNgu';

interface Props {
  /** Kiểu gọn cho đầu trang, kiểu đầy đủ cho menu điện thoại */
  kieu?: 'gon' | 'day-du';
  className?: string;
}

export default function NutNgonNgu({ kieu = 'gon', className = '' }: Props) {
  const { laTiengAnh, doiNgonNgu, t } = useNgonNgu();

  const chuyenSang = laTiengAnh ? 'vi' : 'en';
  const nhan = laTiengAnh ? t('lang.switchToVi') : t('lang.switchToEn');

  if (kieu === 'day-du') {
    return (
      <button
        type="button"
        onClick={() => doiNgonNgu(chuyenSang)}
        aria-label={t('lang.label')}
        className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
      >
        <Languages className="h-4 w-4" />
        {nhan}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => doiNgonNgu(chuyenSang)}
      aria-label={t('lang.label')}
      title={nhan}
      className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
    >
      <Languages className="h-4 w-4" />
      {/* Chỉ hai chữ cái cho gọn thanh menu, nhưng vẫn có tên đầy đủ ở
          aria-label và title cho trình đọc màn hình và khi rê chuột. */}
      <span>{laTiengAnh ? 'VI' : 'EN'}</span>
    </button>
  );
}
