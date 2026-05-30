import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-surface-2 text-content-secondary',
  success:
    'bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500',
  warning:
    'bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500',
  danger:
    'bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500',
  info:
    'bg-primary-50 text-primary-700 dark:bg-primary-700/20 dark:text-primary-400',
  outline: 'border border-border text-content-secondary',
};

const dotColorClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-content-tertiary',
  success: 'bg-success-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-600',
  info: 'bg-primary-600',
  outline: 'bg-content-tertiary',
};

const sizeClasses: Record<NonNullable<BadgeProps['size']>, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
}) => {
  const classes = [
    'rounded-full font-medium inline-flex items-center gap-1.5',
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColorClasses[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';
