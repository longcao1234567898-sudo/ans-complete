/**
 * Thanh hiển thị tiến trình 5 bước của form gửi ý kiến.
 */
import { Check } from 'lucide-react';
import { cn } from '../../utils/helpers';

const STEPS = ['Nội dung', 'AI phân tích', 'Chọn nhóm', 'Liên hệ', 'Xác nhận'];

export default function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center" aria-label="Tiến trình gửi ý kiến">
      {STEPS.map((label, idx) => {
        const step = idx + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  done && 'bg-primary-600 text-white',
                  active && 'bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/40',
                  !done && !active && 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : step}
              </span>
              <span
                className={cn(
                  'hidden text-center text-[11px] leading-tight sm:block',
                  active ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-slate-400'
                )}
              >
                {label}
              </span>
            </div>
            {step < STEPS.length && (
              <span
                className={cn(
                  'mx-1.5 h-0.5 flex-1 rounded transition-colors sm:mx-2',
                  done ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-700'
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
