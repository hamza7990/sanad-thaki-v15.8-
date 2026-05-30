import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Filter,
} from 'lucide-react';
import { cn } from '@/utils/utils';

// ============================================================
// DataTable Types
// ============================================================

export interface Column<T> {
  key: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortable?: boolean;
  sortKey?: string;
  width?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;

  // Selection
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;

  // Sorting
  sortable?: boolean;
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  onSort?: (key: string, direction: 'asc' | 'desc') => void;

  // Pagination
  pagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  totalItems?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;

  // Search
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;

  // Actions
  onRowClick?: (row: T) => void;
  actions?: React.ReactNode;

  // States
  loading?: boolean;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;

  // Export
  exportable?: boolean;
  onExport?: () => void;

  className?: string;
}

// ============================================================
// DataTable Component
// ============================================================

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  sortable = false,
  defaultSortKey,
  defaultSortDirection = 'asc',
  onSort,
  pagination = false,
  pageSize: controlledPageSize,
  pageSizeOptions = [10, 25, 50],
  totalItems,
  currentPage: controlledPage,
  onPageChange,
  onPageSizeChange,
  searchable = false,
  searchPlaceholder,
  onSearch,
  onRowClick,
  actions,
  loading = false,
  emptyTitle,
  emptyDescription,
  exportable = false,
  onExport,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  // Local state for uncontrolled mode
  const [localSort, setLocalSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: defaultSortKey || '',
    direction: defaultSortDirection,
  });
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(controlledPageSize || 10);
  const [searchQuery, setSearchQuery] = useState('');

  const page = controlledPage ?? localPage;
  const pageSize = controlledPageSize ?? localPageSize;
  const total = totalItems ?? data.length;
  const totalPages = Math.ceil(total / pageSize);

  // Selection handlers
  const allSelected = data.length > 0 && data.every(row => selectedKeys.has(keyExtractor(row)));
  const someSelected = data.some(row => selectedKeys.has(keyExtractor(row)));

  const toggleAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      const allKeys = new Set(data.map(keyExtractor));
      onSelectionChange(allKeys);
    }
  }, [allSelected, data, keyExtractor, onSelectionChange]);

  const toggleRow = useCallback(
    (key: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectionChange(next);
    },
    [selectedKeys, onSelectionChange]
  );

  // Sort handler
  const handleSort = useCallback(
    (key: string) => {
      const newDirection =
        localSort.key === key && localSort.direction === 'asc' ? 'desc' : 'asc';
      setLocalSort({ key, direction: newDirection });
      onSort?.(key, newDirection);
    },
    [localSort, onSort]
  );

  // Search handler
  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      onSearch?.(e.target.value);
    },
    [onSearch]
  );

  // Paginated data for uncontrolled mode
  const displayData = useMemo(() => {
    if (onPageChange) return data; // Server-side pagination
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize, onPageChange]);

  // Page change handlers
  const goToPage = useCallback(
    (p: number) => {
      if (p < 1 || p > totalPages) return;
      setLocalPage(p);
      onPageChange?.(p);
    },
    [totalPages, onPageChange]
  );

  const handlePageSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const size = parseInt(e.target.value);
      setLocalPageSize(size);
      setLocalPage(1);
      onPageSizeChange?.(size);
      onPageChange?.(1);
    },
    [onPageSizeChange, onPageChange]
  );

  // Sort icon
  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (localSort.key !== columnKey) {
      return <ChevronsUpDown className="w-3.5 h-3.5 text-content-tertiary" />;
    }
    return localSort.direction === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-primary-500" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-primary-500" />
    );
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Toolbar */}
      {(searchable || actions || exportable || (selectable && someSelected)) && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            {/* Search */}
            {searchable && (
              <div className="relative max-w-xs flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={handleSearch}
                  placeholder={searchPlaceholder || t('common.search')}
                  className="h-9 w-full rounded-lg border border-border bg-surface-1 ps-9 pe-3 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                  aria-label={t('common.search')}
                />
              </div>
            )}

            {/* Selection count */}
            {selectable && someSelected && (
              <span className="text-sm text-primary-600 font-medium">
                {selectedKeys.size} {t('common.selected')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Export */}
            {exportable && onExport && (
              <button
                onClick={onExport}
                className="h-9 px-3 rounded-lg border border-border bg-surface-1 hover:bg-surface-2 text-sm text-content-primary inline-flex items-center gap-2 transition-colors"
                aria-label={t('common.export')}
              >
                <Download className="w-4 h-4" />
                {t('common.export')}
              </button>
            )}

            {/* Custom actions */}
            {actions}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-surface-1">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                {/* Select all checkbox */}
                {selectable && (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                      aria-label={t('common.selectAll')}
                    />
                  </th>
                )}
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 font-semibold text-content-secondary whitespace-nowrap',
                      col.align === 'center' && 'text-center',
                      col.align === 'end' && 'text-end',
                      col.align !== 'center' && col.align !== 'end' && 'text-start',
                      col.sortable && 'cursor-pointer select-none hover:text-content-primary',
                      col.className
                    )}
                    style={col.width ? { width: col.width } : undefined}
                    onClick={col.sortable ? () => handleSort(col.sortKey || col.key) : undefined}
                    aria-sort={
                      localSort.key === (col.sortKey || col.key)
                        ? localSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.header}
                      {col.sortable && <SortIcon columnKey={col.sortKey || col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Loading skeleton */}
              {loading &&
                Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {selectable && (
                      <td className="px-4 py-3">
                        <div className="skeleton w-4 h-4 rounded" />
                      </td>
                    )}
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="skeleton h-4 rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}

              {/* Empty state */}
              {!loading && displayData.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-base font-medium text-content-secondary">
                        {emptyTitle || t('common.noData')}
                      </p>
                      {emptyDescription && (
                        <p className="text-sm text-content-tertiary max-w-xs">
                          {emptyDescription}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!loading &&
                displayData.map(row => {
                  const key = keyExtractor(row);
                  const isSelected = selectedKeys.has(key);
                  return (
                    <tr
                      key={key}
                      className={cn(
                        'transition-colors',
                        onRowClick && 'cursor-pointer hover:bg-surface-2',
                        isSelected && 'bg-primary-50 dark:bg-primary-950/20'
                      )}
                      onClick={() => onRowClick?.(row)}
                      role={onRowClick ? 'button' : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }}
                    >
                      {selectable && (
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(key)}
                            className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500"
                            aria-label={`Select row ${key}`}
                          />
                        </td>
                      )}
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-4 py-3 text-content-primary',
                            col.align === 'center' && 'text-center',
                            col.align === 'end' && 'text-end',
                            col.className
                          )}
                        >
                          {col.accessor(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {pagination && totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-2">
            <div className="flex items-center gap-4">
              <span className="text-sm text-content-secondary">
                {t('common.showing')} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {t('common.of')} {total} {t('common.results')}
              </span>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                className="h-8 rounded-md border border-border bg-surface-1 px-2 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label={t('common.perPage')}
              >
                {pageSizeOptions.map(size => (
                  <option key={size} value={size}>
                    {size} {t('common.perPage')}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="h-8 w-8 rounded-md border border-border bg-surface-1 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors"
                aria-label="Previous page"
              >
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={cn(
                      'h-8 min-w-[2rem] px-2 rounded-md text-sm font-medium transition-colors',
                      pageNum === page
                        ? 'bg-primary-700 text-white'
                        : 'border border-border bg-surface-1 hover:bg-surface-2 text-content-primary'
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="h-8 w-8 rounded-md border border-border bg-surface-1 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors"
                aria-label="Next page"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
