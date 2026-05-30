import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  lines?: number;
}

const roundedClasses: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

// Varying widths for multi-line text skeletons to look natural
const lineWidths = ['100%', '90%', '75%', '95%', '80%', '70%', '85%'];

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  rounded = 'md',
  lines,
}) => {
  if (lines && lines > 0) {
    return (
      <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={`skeleton h-4 ${roundedClasses[rounded]}`}
            style={{ width: lineWidths[i % lineWidths.length] }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`skeleton ${roundedClasses[rounded]} ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? '1rem',
      }}
      aria-hidden="true"
    />
  );
};

Skeleton.displayName = 'Skeleton';
