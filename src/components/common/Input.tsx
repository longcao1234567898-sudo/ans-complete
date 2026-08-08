/**
 * Ô nhập liệu dùng chung, có label + thông báo lỗi (accessible).
 */
import { InputHTMLAttributes, forwardRef, useId } from 'react';
import { cn } from '../../utils/helpers';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2',
            'dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
            error
              ? 'border-red-400 focus:ring-red-300'
              : 'border-slate-300 focus:border-primary-500 focus:ring-primary-200 dark:border-slate-600',
            className
          )}
          {...rest}
        />
        {hint && !error && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
