import React from 'react';

/* -------------------------------------------------------------------------- */
/*  Card                                                                      */
/* -------------------------------------------------------------------------- */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingClasses: Record<NonNullable<CardProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'none',
  hover = false,
}) => {
  const classes = [
    'card rounded-xl',
    paddingClasses[padding],
    hover ? 'hover:shadow-elevated transition-shadow' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
};

Card.displayName = 'Card';

/* -------------------------------------------------------------------------- */
/*  CardHeader                                                                */
/* -------------------------------------------------------------------------- */

interface CardSectionProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardSectionProps> = ({
  children,
  className = '',
}) => (
  <div
    className={`px-6 py-4 border-b border-border flex items-center justify-between ${className}`}
  >
    {children}
  </div>
);

CardHeader.displayName = 'CardHeader';

/* -------------------------------------------------------------------------- */
/*  CardContent                                                               */
/* -------------------------------------------------------------------------- */

export const CardContent: React.FC<CardSectionProps> = ({
  children,
  className = '',
}) => <div className={`p-6 ${className}`}>{children}</div>;

CardContent.displayName = 'CardContent';

/* -------------------------------------------------------------------------- */
/*  CardFooter                                                                */
/* -------------------------------------------------------------------------- */

export const CardFooter: React.FC<CardSectionProps> = ({
  children,
  className = '',
}) => (
  <div
    className={`px-6 py-4 border-t border-border flex items-center justify-end gap-3 ${className}`}
  >
    {children}
  </div>
);

CardFooter.displayName = 'CardFooter';
