import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

type Props = {
  page: number;
  pageCount: number;
  /** Leave out when the server pages without a count: the pager then shows "Page n" and the range only. */
  total?: number;
  startIndex: number;
  endIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** When set, numbered page buttons replace the "Page x of y" text. */
  onPageChange?: (page: number) => void;
  /** With `onPageSizeChange`, shows a rows-per-page picker. */
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
};

const DEFAULT_PAGE_SIZES = [10, 20, 50];

/** Page numbers to show: the first, the last, and the current one with its neighbours; gaps become "…". */
function pageButtons(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['gap' as const, p] : [p]));
}

const BUTTON =
  'flex h-9 min-w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface px-2 text-xs font-medium text-on-surface transition-colors hover:bg-surface-high disabled:cursor-not-allowed disabled:opacity-40';

/**
 * The pager under a list: "Showing X–Y of Z", an optional rows-per-page picker, and
 * previous / page / next controls. Arrows flip in RTL. Renders nothing when there is
 * nothing to page through.
 */
export function Pagination({
  page,
  pageCount,
  total,
  startIndex,
  endIndex,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onPageChange,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  onPageSizeChange,
  className,
}: Props) {
  const { t, i18n } = useTranslation();
  const canResize = Boolean(onPageSizeChange && pageSize);
  const smallestSize = Math.min(...pageSizeOptions);
  if (pageCount <= 1 && !(canResize && (total ?? 0) > smallestSize)) return null;
  const knownTotal = total !== undefined;
  const isRTL = i18n.language === 'ar';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-3',
        className,
      )}
    >
      <p className="text-xs text-on-surface-variant">
        {knownTotal
          ? t('common.paginationSummary', { start: startIndex, end: endIndex, total })
          : t('common.paginationRange', { start: startIndex, end: endIndex })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {canResize ? (
          <label className="flex items-center gap-2 text-xs text-on-surface-variant">
            {t('common.rowsPerPage')}
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="h-9 rounded-lg border border-outline-variant bg-surface px-2 text-xs font-medium text-on-surface"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        ) : null}
        {pageCount > 1 ? (
          <nav className="flex items-center gap-1" aria-label={t('common.pagination')}>
            <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label={t('common.previous')} className={BUTTON}>
              <MaterialSymbol name={isRTL ? 'chevron_right' : 'chevron_left'} size="text-base" />
            </button>
            {onPageChange && knownTotal ? (
              pageButtons(page, pageCount).map((item, index) =>
                item === 'gap' ? (
                  <span key={`gap-${index}`} className="px-1 text-xs text-on-surface-variant" aria-hidden>…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onPageChange(item)}
                    aria-current={item === page ? 'page' : undefined}
                    className={cn(BUTTON, 'tabular-nums', item === page && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}
                  >
                    {item}
                  </button>
                ),
              )
            ) : (
              <span className="min-w-[5rem] text-center text-xs font-medium text-on-surface-variant">
                {knownTotal ? t('common.pageOf', { page, pageCount }) : t('common.pageNumber', { page })}
              </span>
            )}
            <button type="button" onClick={onNext} disabled={!hasNext} aria-label={t('common.next')} className={BUTTON}>
              <MaterialSymbol name={isRTL ? 'chevron_left' : 'chevron_right'} size="text-base" />
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
