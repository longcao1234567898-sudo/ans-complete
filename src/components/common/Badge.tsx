/**
 * Nhãn nhỏ (badge/chip) hiển thị phân loại, trạng thái.
 */
import { ReactNode } from 'react';
import { cn } from '../../utils/helpers';

interface BadgeProps {
  children: ReactNode;
  colorClass?: string;
  className?: string;
}

export default function Badge({ children, colorClass, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        colorClass ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        className
      )}
    >
      {children}
    </span>
  );
}
