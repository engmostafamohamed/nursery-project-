import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/FilterBar';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';

import { ExtraActions } from './ExtraActions';
import { GiveExtraDialog } from './GiveExtraDialog';
import { REQUEST_LOOK } from './kitchenLook';
import { sortRequests, type ClassChildExtras } from './kitchenSales';
import { kitchenErrorKey } from './kitchenSalesApi';
import { useClassExtras } from './useKitchenSales';

/**
 * Today's extras for the children a teacher looks after (their classes, or the ones they cover):
 * what was ordered or is waiting for a parent, serving it, and giving a child an extra.
 */
export function TeacherExtrasPanel() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const query = useClassExtras();
  const [search, setSearch] = useState('');
  const [giving, setGiving] = useState<ClassChildExtras | null>(null);
  const name = (ar: string, en: string) => (isArabic ? ar || en : en || ar) || '—';

  const children = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (query.data?.children ?? []).filter((c) => !term || `${c.nameAr} ${c.nameEn}`.toLowerCase().includes(term));
    // Children with something to do first (waiting or to serve), then the ones here, then the rest.
    const rank = (c: ClassChildExtras) => (c.requests.some((r) => r.status === 'approved' || r.status === 'waiting_parent') ? 0 : c.here ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [query.data?.children, search]);
  const toServe = (query.data?.children ?? []).reduce((n, c) => n + c.requests.filter((r) => r.status === 'approved').length, 0);

  return (
    <section aria-labelledby="teacher-extras" className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5" data-testid="teacher-extras">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="teacher-extras" className="flex items-center gap-2 font-semibold text-on-surface">
            <MaterialSymbol name="cookie" size="text-xl" className="text-primary" />
            {t('kitchenSales.teacher.title')}
            {toServe ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{t('kitchenSales.teacher.toServe', { count: toServe })}</span> : null}
          </h2>
          <p className="text-xs text-on-surface-variant">{t('kitchenSales.teacher.hint')}</p>
        </div>
        <div className="w-full sm:w-64">
          <SearchInput value={search} onChange={setSearch} placeholder={t('kitchenSales.teacher.search')} />
        </div>
      </div>

      {query.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-error">{t(kitchenErrorKey(query.error))}</p>
      ) : !children.length ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">{t('kitchenSales.teacher.noChildren')}</p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
          {children.map((c) => {
            const childName = name(c.nameAr, c.nameEn);
            return (
              <li key={c.childId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center" data-testid="teacher-extra-child">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-on-surface">{childName}</span>
                    <span className="text-xs text-on-surface-variant">{name(c.classAr, c.classEn)}</span>
                    {!c.here ? <StatusPill tone="neutral">{t('kitchenSales.teacher.notHere')}</StatusPill> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {c.consent.snacks || c.consent.meals ? t('kitchenSales.teacher.consent', { what: [c.consent.snacks && t('kitchenSales.teacher.snacksDrinks'), c.consent.meals && t('kitchenSales.teacher.meals')].filter(Boolean).join(' · ') }) : t('kitchenSales.teacher.noConsent')}
                  </p>
                  {c.requests.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {sortRequests(c.requests).map((r) => {
                        const look = REQUEST_LOOK[r.status];
                        return (
                          <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <StatusPill tone={look.tone} icon={look.icon}>{t(`kitchenSales.extras.statuses.${r.status}`)}</StatusPill>
                            <span className="text-on-surface">{r.itemName} × {r.quantity}</span>
                            <span className="text-xs text-on-surface-variant">{t(`kitchenSales.extras.sources.${r.source}`)}</span>
                            <ExtraActions request={r} childName={childName} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
                <Button type="button" size="sm" variant="outline" className="self-start sm:self-center" onClick={() => setGiving(c)} disabled={!query.data?.items.length}>
                  <MaterialSymbol name="add" size="text-base" className="me-1" />
                  {t('kitchenSales.teacher.give')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {giving && query.data ? <GiveExtraDialog child={giving} items={query.data.items} onClose={() => setGiving(null)} /> : null}
    </section>
  );
}
