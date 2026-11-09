import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { searchKitchenChildren, type KitchenChild } from './kitchenSalesApi';

/**
 * Finding a child by name (the nursery may have thousands): type, then choose from the first 20
 * matches. The chosen child shows as a chip that can be cleared.
 */
export function ChildSearch({
  id,
  nurseryId,
  value,
  onChange,
  invalid = false,
}: {
  id: string;
  nurseryId: string;
  value: KitchenChild | null;
  onChange: (child: KitchenChild | null) => void;
  invalid?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [text]);
  const results = useQuery({
    queryKey: ['kitchen-sales', 'children', nurseryId, term],
    queryFn: () => searchKitchenChildren(nurseryId, term),
    enabled: term.length >= 2 && !value,
    staleTime: 30_000,
  });
  const name = (c: KitchenChild) => (isArabic ? c.nameAr || c.nameEn : c.nameEn || c.nameAr);
  const cls = (c: KitchenChild) => (isArabic ? c.classAr || c.classEn : c.classEn || c.classAr);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2" data-testid="child-chosen">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-on-surface">{name(value)}</span>
          {cls(value) ? <span className="block text-xs text-on-surface-variant">{cls(value)}</span> : null}
        </span>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-high" aria-label={t('kitchenSales.charge.changeChild')}>
          <MaterialSymbol name="close" size="text-lg" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <MaterialSymbol name="search" size="text-lg" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('kitchenSales.charge.searchChild')} className={cn('ps-10', invalid && 'border-error')} autoComplete="off" />
      </div>
      {term.length >= 2 ? (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-outline-variant" role="listbox" aria-label={t('kitchenSales.charge.searchResults')}>
          {results.isFetching && !results.data ? (
            <li className="px-3 py-2 text-sm text-on-surface-variant">{t('common.loading')}</li>
          ) : (results.data ?? []).length === 0 ? (
            <li className="px-3 py-2 text-sm text-on-surface-variant">{t('kitchenSales.charge.noChildFound')}</li>
          ) : (
            (results.data ?? []).map((c) => (
              <li key={c.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-surface-high">
                  <span className="font-medium text-on-surface">{name(c)}</span>
                  <span className="text-xs text-on-surface-variant">{cls(c) ?? ''}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
