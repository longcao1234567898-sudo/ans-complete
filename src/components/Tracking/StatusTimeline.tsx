/**
 * Hiển thị timeline dọc tiến độ xử lý: Đã tiếp nhận → Đang xử lý → Đã giải quyết
 * (hoặc Từ chối kèm lý do).
 */
import { AlertOctagon, Check, Circle, Clock } from 'lucide-react';
import type { TrackingResult } from '../../types/tracking';
import { CATEGORY_MAP, STATUS_MAP } from '../../utils/constants';
import { cn, formatDate } from '../../utils/helpers';
import Badge from '../common/Badge';
import Card from '../common/Card';

export default function StatusTimeline({ result }: { result: TrackingResult }) {
  const category = CATEGORY_MAP[result.category];
  const currentStatus = STATUS_MAP[result.status];

  return (
    <Card className="mt-2">
      {/* Tóm tắt */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <p className="font-mono text-lg font-bold tracking-widest text-primary-700 dark:text-primary-300">
            {result.code}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{result.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge colorClass={currentStatus.colorClass}>{currentStatus.label}</Badge>
          <Badge colorClass={category.colorClass}>{category.label}</Badge>
        </div>
      </div>

      {/* Lý do từ chối (nếu có) */}
      {result.status === 'rejected' && result.rejectionReason && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Lý do từ chối thụ lý</p>
            <p className="mt-0.5 leading-relaxed">{result.rejectionReason}</p>
          </div>
        </div>
      )}

      {/* Timeline */}
      <ol className="relative ml-3 space-y-6 border-l-2 border-slate-200 pl-6 dark:border-slate-700">
        {result.steps.map((step, idx) => (
          <li key={`${step.status}-${idx}`} className="relative">
            <span
              className={cn(
                'absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900',
                step.done
                  ? step.status === 'rejected'
                    ? 'bg-red-500 text-white'
                    : 'bg-primary-600 text-white'
                  : 'bg-slate-200 text-slate-400 dark:bg-slate-700'
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
            </span>
            <p className={cn('text-sm font-semibold', step.done ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400')}>
              {step.label}
            </p>
            {step.timestamp && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3 w-3" /> {formatDate(step.timestamp)}
              </p>
            )}
            {step.note && <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{step.note}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
