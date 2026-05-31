// ============================================================
// Sanad Thaki — Utility Functions
// ============================================================

/**
 * Format a number as SAR currency.
 */
export function formatCurrency(amount: number | null | undefined, locale = 'ar-SA'): string {
  const val = Number(amount ?? 0);
  if (isNaN(val)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
  }).format(val);
}

/**
 * Format a date in short form (e.g. "٢٣ مايو ٢٠٢٥").
 */
export function formatDate(date: string | Date | null | undefined, locale = 'ar-SA'): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Format a date as a relative time string (e.g. "قبل ساعتين").
 */
export function formatRelativeTime(date: string | Date | null | undefined, locale = 'ar-SA'): string {
  if (!date) return '—';
  try {
    const now = new Date();
    const then = new Date(date);
    if (isNaN(then.getTime())) return '—';
    const diffMs = now.getTime() - then.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (diffDay > 0) return rtf.format(-diffDay, 'day');
    if (diffHr > 0) return rtf.format(-diffHr, 'hour');
    if (diffMin > 0) return rtf.format(-diffMin, 'minute');
    return rtf.format(-diffSec, 'second');
  } catch {
    return '—';
  }
}

/**
 * Merge class names, filtering out falsy values (like clsx).
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Format a number as a percentage string.
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format a number with locale-aware grouping.
 */
export function formatNumber(value: number, locale = 'ar-SA'): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Truncate text to a maximum length, appending "…" if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Generate a cryptographically random UUID.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Extract up to 2 initials from a full name.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ============================================================
// Status → Badge variant mappers
// ============================================================

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Map an invoice status string to a Badge color variant.
 */
export function getInvoiceStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    DRAFT: 'default',
    NEEDS_REVIEW: 'warning',
    READY_FOR_REVIEW: 'info',
    APPROVED: 'success',
    REJECTED: 'danger',
    PAID: 'success',
  };
  return map[status] || 'default';
}

/**
 * Map a reconciliation match status to a Badge color variant.
 */
export function getMatchStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
  };
  return map[status] || 'default';
}

/**
 * Map a WhatsApp message status to a Badge color variant.
 */
export function getWhatsAppStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    QUEUED: 'default',
    SENT: 'info',
    DELIVERED: 'success',
    READ: 'success',
    FAILED: 'danger',
  };
  return map[status] || 'default';
}
