import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

let textareaIdCounter = 0;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, id, rows = 4, className = '', ...props }, ref) => {
    const generatedId = React.useMemo(() => id || `textarea-${++textareaIdCounter}`, [id]);
    const errorId = error ? `${generatedId}-error` : undefined;
    const hintId = hint && !error ? `${generatedId}-hint` : undefined;

    const textareaClasses = [
      'w-full rounded-lg border bg-surface-1 px-3 py-2 text-sm text-content-primary',
      'placeholder:text-content-tertiary',
      'focus:outline-none focus:ring-2 focus:border-transparent transition-colors',
      'resize-y',
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

        <textarea
          ref={ref}
          id={generatedId}
          rows={rows}
          className={textareaClasses}
          aria-invalid={!!error}
          aria-describedby={errorId || hintId}
          {...props}
        />

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

Textarea.displayName = 'Textarea';
