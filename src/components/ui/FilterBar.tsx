import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * The filters above a list: labelled <FilterField>s that wrap onto new lines on narrow screens,
 * then a "Clear filters" button (disabled while nothing is filtered).
 */
export function FilterBar({
  children,
  onClear,
  canClear = false,
  className,
}: {
  children: ReactNode;
  onClear?: () => void;
  canClear?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
      {onClear ? (
        <Button type="button" variant="ghost" className="ms-auto h-12 shrink-0" onClick={onClear} disabled={!canClear}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>filter_alt_off</span>
          {t('common.clearFilters')}
        </Button>
      ) : null}
    </div>
  );
}

/** A search box with a leading search icon. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <span className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant" aria-hidden>
        search
      </span>
      <Input type="search" className="ps-10" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
