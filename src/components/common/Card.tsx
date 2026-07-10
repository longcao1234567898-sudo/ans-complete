/**
 * Thẻ nội dung dùng chung: hỗ trợ glassmorphism và hiệu ứng hover.
 */
import { HTMLAttributes } from 'react';
import { cn } from '../../utils/helpers';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  hover?: boolean;
}

export default function Card({ glass = false, hover = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-5 shadow-soft',
        glass ? 'glass' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800',
        hover && 'transition-transform duration-300 will-change-transform hover:-translate-y-1 hover:shadow-lg',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
