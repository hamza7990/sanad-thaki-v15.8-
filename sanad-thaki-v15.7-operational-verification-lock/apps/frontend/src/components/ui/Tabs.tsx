import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/utils';

interface Tab {
  key: string;
  label: string;
  icon?: React.ElementType;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange?: (key: string) => void;
  variant?: 'underline' | 'pills';
  size?: 'sm' | 'md';
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
}: TabsProps) {
  const [localActive, setLocalActive] = useState(tabs[0]?.key || '');
  const active = activeTab ?? localActive;

  const handleChange = (key: string) => {
    setLocalActive(key);
    onChange?.(key);
  };

  if (variant === 'pills') {
    return (
      <div className={cn('flex items-center gap-1 p-1 rounded-xl bg-surface-2', className)} role="tablist">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleChange(tab.key)}
              className={cn(
                'relative rounded-lg font-medium transition-colors inline-flex items-center gap-2',
                size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
                isActive
                  ? 'text-content-primary'
                  : 'text-content-secondary hover:text-content-primary'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="pill-indicator"
                  className="absolute inset-0 bg-surface-1 rounded-lg shadow-card"
                  transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={cn(
                      'min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium inline-flex items-center justify-center',
                      isActive
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-400'
                        : 'bg-surface-3 text-content-tertiary'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Underline variant
  return (
    <div className={cn('flex items-center gap-0 border-b border-border', className)} role="tablist">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleChange(tab.key)}
            className={cn(
              'relative font-medium transition-colors inline-flex items-center gap-2 border-b-2 -mb-px',
              size === 'sm' ? 'px-3 pb-2.5 text-xs' : 'px-4 pb-3 text-sm',
              isActive
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-border'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium inline-flex items-center justify-center',
                  isActive
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-400'
                    : 'bg-surface-2 text-content-tertiary'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
