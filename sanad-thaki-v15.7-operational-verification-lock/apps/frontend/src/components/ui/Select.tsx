import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

let selectIdCounter = 0;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder,
      value,
      onChange,
      id,
      className = '',
      ...props
    },
    ref
  ) => {
    const generatedId = React.useMemo(() => id || `select-${++selectIdCounter}`, [id]);
    const errorId = error ? `${generatedId}-error` : undefined;
    const hintId = hint && !error ? `${generatedId}-hint` : undefined;

    const selectClasses = [
      'h-10 w-full rounded-lg border bg-surface-1 px-3 pe-10 text-sm text-content-primary',
      'appearance-none',
      'focus:outline-none focus:ring-2 focus:border-transparent transition-colors',
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
          <select
            ref={ref}
            id={generatedId}
            value={value}
            onChange={onChange}
            className={selectClasses}
            aria-invalid={!!error}
            aria-describedby={errorId || hintId}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div
            className="absolute end-0 top-0 h-10 w-10 flex items-center justify-center text-content-tertiary pointer-events-none"
            aria-hidden="true"
          >
            <ChevronDown size={16} />
          </div>
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

Select.displayName = 'Select';
