import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-surface-2 mb-4">
        <Icon
          size={24}
          className="text-content-tertiary"
          aria-hidden="true"
        />
      </div>

      <h3 className="text-lg font-semibold text-content-primary text-center">
        {title}
      </h3>

      {description && (
        <p className="mt-1 text-sm text-content-secondary max-w-sm text-center">
          {description}
        </p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';
