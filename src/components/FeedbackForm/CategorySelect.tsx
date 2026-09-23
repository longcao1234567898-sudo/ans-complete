/**
 * Bước 3: Xác nhận / thay đổi nhóm xử lý (mặc định chọn theo gợi ý của AI).
 */
import { CheckCircle2 } from 'lucide-react';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import type { FeedbackCategory } from '../../types/feedback';
import { CATEGORIES } from '../../utils/constants';
import Button from '../common/Button';
import { cn } from '../../utils/helpers';

interface CategorySelectProps {
  value: FeedbackCategory | null;
  suggested: FeedbackCategory | null;
  onChange: (c: FeedbackCategory) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function CategorySelect({ value, suggested, onChange, onNext, onBack }: CategorySelectProps) {
  const { t } = useNgonNgu();
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">{t('cs.chonNhomXuLy')}</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        {t('cs.heThongDaGoi')}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const active = value === cat.id;
          return (
            <button
            data-hd="the-nhom"
              key={cat.id}
              type="button"
              onClick={() => onChange(cat.id)}
              className={cn(
                'relative rounded-xl border p-4 text-left transition',
                active
                  ? 'border-primary-500 bg-primary-50 shadow-soft dark:bg-primary-900/20'
                  : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
              )}
            >
              {active && <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-primary-600" />}
              <span className={cn('mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', cat.colorClass)}>
                {cat.label}
              </span>
              {cat.id === suggested && (
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  Gợi ý
                </span>
              )}
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{cat.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t('cs.quayLai')}
        </Button>
        <Button onClick={onNext} disabled={!value}>
          {t('cs.tiepTucThongTin')}
        </Button>
      </div>
    </div>
  );
}
