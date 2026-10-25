/**
 * TinDaXepHang — màn hình sau khi bấm Gửi lúc mất mạng (P92): tin đã được mã hoá,
 * cất trên máy, sẽ tự gửi khi có mạng (services/hangChoGui.ts).
 *
 * Không hiện lại nội dung tin (người khác cầm máy cũng không đọc được từ đây).
 * Nhắc rõ: việc khẩn cấp đừng chờ — gọi 113 ngay.
 */
import { CloudOff, Phone } from 'lucide-react';
import Button from '../common/Button';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import { UNIT } from '../../utils/constants';

export default function TinDaXepHang({ onSoanMoi }: { onSoanMoi: () => void }) {
  const { t } = useNgonNgu();
  return (
    <div data-hd="tin-da-xep-hang" className="rounded-2xl bg-white p-6 text-center shadow-soft dark:bg-slate-900">
      <CloudOff className="mx-auto mb-3 h-12 w-12 text-amber-500" />
      <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{t('hcg.tieuDe')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('hcg.moTa')}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('hcg.riengTu')}</p>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
        <Phone className="h-4 w-4" /> {t('hcg.khan')}{' '}
        <a href={`tel:${UNIT.emergency}`} className="font-extrabold underline">{UNIT.emergency}</a>
      </p>
      <div className="mt-5 flex justify-center">
        <Button variant="outline" onClick={onSoanMoi}>{t('hcg.soanMoi')}</Button>
      </div>
    </div>
  );
}
