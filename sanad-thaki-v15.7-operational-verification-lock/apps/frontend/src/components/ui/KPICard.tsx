import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/utils/utils';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    label?: string;
  };
  icon?: LucideIcon;
  iconColor?: string;
  format?: 'currency' | 'percentage' | 'number' | 'text';
  loading?: boolean;
  className?: string;
}

export function KPICard({
  title,
  value,
  change,
  icon: Icon,
  iconColor,
  loading = false,
  className,
}: KPICardProps) {
  const isPositive = change && change.value > 0;
  const isNegative = change && change.value < 0;
  const isNeutral = change && change.value === 0;

  if (loading) {
    return (
      <div className={cn('card p-5', className)}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-8 w-32 mb-2" />
            <div className="skeleton h-3 w-16" />
          </div>
          <div className="skeleton w-10 h-10 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('card p-5 transition-shadow hover:shadow-elevated', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-content-secondary font-medium truncate">{title}</p>
          <p className="text-2xl font-bold text-content-primary mt-1 tracking-tight">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1.5 mt-2">
              {isPositive && <TrendingUp className="w-3.5 h-3.5 text-success-600" />}
              {isNegative && <TrendingDown className="w-3.5 h-3.5 text-danger-600" />}
              {isNeutral && <Minus className="w-3.5 h-3.5 text-content-tertiary" />}
              <span
                className={cn(
                  'text-xs font-medium',
                  isPositive && 'text-success-600',
                  isNegative && 'text-danger-600',
                  isNeutral && 'text-content-tertiary'
                )}
              >
                {isPositive && '+'}{change.value}%
              </span>
              {change.label && (
                <span className="text-xs text-content-tertiary">{change.label}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              iconColor || 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
