import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

type Props = {
  page: number;
  pageCount: number;
  total: number;
  startIndex: number;
  endIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

/**
 * Presentational pager: a "showing X–Y of Z" summary plus prev/next controls.
 * Arrows flip automatically in RTL. Renders nothing when there's a single page.
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
  className,
}: Props) {
  const { t, i18n } = useTranslation();
  if (pageCount <= 1) return null;
  const isRTL = i18n.language === 'ar';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-3',
        className,
      )}
    >
      <p className="text-xs text-on-surface-variant">
        {t('common.paginationSummary', { start: startIndex, end: endIndex, total })}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label={t('common.previous')}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MaterialSymbol name={isRTL ? 'chevron_right' : 'chevron_left'} size="text-base" />
        </button>
        <span className="min-w-[5rem] text-center text-xs font-medium text-on-surface-variant">
          {t('common.pageOf', { page, pageCount })}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          aria-label={t('common.next')}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MaterialSymbol name={isRTL ? 'chevron_left' : 'chevron_right'} size="text-base" />
        </button>
      </div>
    </div>
  );
}
