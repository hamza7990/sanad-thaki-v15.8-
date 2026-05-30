import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-primary-700 hover:bg-primary-800 text-white focus-visible:outline-primary-500',
  secondary:
    'bg-surface-2 hover:bg-surface-3 text-content-primary border border-border focus-visible:outline-primary-500',
  outline:
    'border border-border hover:bg-surface-2 text-content-primary focus-visible:outline-primary-500',
  ghost:
    'hover:bg-surface-2 text-content-primary focus-visible:outline-primary-500',
  danger:
    'bg-danger-600 hover:bg-danger-700 text-white focus-visible:outline-danger-500',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

const iconSizeMap: Record<NonNullable<ButtonProps['size']>, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon: Icon,
      iconPosition = 'start',
      fullWidth = false,
      disabled,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const classes = [
      'rounded-lg font-medium transition-colors duration-150',
      'inline-flex items-center justify-center',
      'focus-visible:outline-2 focus-visible:outline-offset-2',
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? 'w-full' : '',
      isDisabled ? 'opacity-50 cursor-not-allowed' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const iconSize = iconSizeMap[size];

    return (
      <button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <Loader2
            size={iconSize}
            className="animate-spin shrink-0"
            aria-hidden="true"
          />
        )}

        {!loading && Icon && iconPosition === 'start' && (
          <Icon size={iconSize} className="shrink-0" aria-hidden="true" />
        )}

        {children && <span>{children}</span>}

        {!loading && Icon && iconPosition === 'end' && (
          <Icon size={iconSize} className="shrink-0" aria-hidden="true" />
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
