/**
 * Bước 3: Xác nhận / thay đổi nhóm xử lý (mặc định chọn theo gợi ý của AI).
 */
import { CheckCircle2 } from 'lucide-react';
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
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">Chọn nhóm xử lý phù hợp</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        AI đã gợi ý sẵn nhóm phù hợp nhất, bà con có thể thay đổi nếu thấy chưa chính xác.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const active = value === cat.id;
          return (
            <button
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
                  AI gợi ý
                </span>
              )}
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{cat.description}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Quay lại
        </Button>
        <Button onClick={onNext} disabled={!value}>
          Tiếp tục — Thông tin liên hệ
        </Button>
      </div>
    </div>
  );
}
