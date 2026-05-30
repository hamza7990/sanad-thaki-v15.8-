import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon: Icon, id, className = '', type = 'text', ...props }, ref) => {
    const defaultId = React.useId();
    const generatedId = id || defaultId;
    const errorId = error ? `${generatedId}-error` : undefined;
    const hintId = hint && !error ? `${generatedId}-hint` : undefined;

    const inputClasses = [
      'h-10 w-full rounded-lg border bg-surface-1 px-3 text-sm text-content-primary',
      'placeholder:text-content-tertiary',
      'focus:outline-none focus:ring-2 focus:border-transparent transition-colors',
      Icon ? 'ps-10' : '',
      error
        ? 'border-danger-500 focus:ring-danger-500'
        : 'border-border focus:ring-primary-500',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={generatedId}
            className="text-sm font-medium text-content-primary"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {Icon && (
            <div
              className="absolute start-0 top-0 h-10 w-10 flex items-center justify-center text-content-tertiary pointer-events-none"
              aria-hidden="true"
            >
              <Icon size={16} />
            </div>
          )}

          <input
            ref={ref}
            id={generatedId}
            type={type}
            className={inputClasses}
            aria-invalid={!!error}
            aria-describedby={errorId || hintId}
            {...props}
          />
        </div>

        {error && (
          <p id={errorId} className="text-xs text-danger-600" role="alert">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="text-xs text-content-tertiary">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
