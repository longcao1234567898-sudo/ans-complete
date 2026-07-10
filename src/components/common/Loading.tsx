/**
 * Các trạng thái tải: vòng tròn quay mượt (CSS thuần) và loading skeleton.
 */
import { cn } from '../../utils/helpers';

/** Vòng xoay tải dữ liệu — dùng border quay bằng GPU nên rất mượt */
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-center gap-2.5 py-8 text-slate-500 dark:text-slate-400', className)}
      role="status"
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 will-change-transform dark:border-primary-900 dark:border-t-primary-400"
        aria-hidden
      />
      <span className="text-sm">{label ?? 'Đang tải...'}</span>
    </div>
  );
}

/** Khối skeleton — truyền className để định kích thước */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}
