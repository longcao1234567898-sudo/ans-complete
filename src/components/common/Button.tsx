/**
 * Nút bấm dùng chung: hỗ trợ nhiều biến thể màu, kích cỡ và trạng thái loading.
 */
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/helpers';

type Variant = 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 shadow-soft',
  secondary:
    'bg-secondary-500 text-white hover:bg-secondary-600 focus-visible:ring-secondary-400 shadow-soft',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 focus-visible:ring-accent-500',
  outline:
    'border border-primary-600 text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:border-primary-400 dark:hover:bg-primary-900/30',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
);

Button.displayName = 'Button';
export default Button;
