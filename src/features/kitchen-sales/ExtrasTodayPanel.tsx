import { useTranslation } from 'react-i18next';

import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { ExtraActions } from './ExtraActions';
import { REQUEST_LOOK } from './kitchenLook';
import { sortRequests } from './kitchenSales';
import { kitchenErrorKey } from './kitchenSalesApi';
import { useKitchenSales } from './useKitchenSales';

/** Every child's extras today across the nursery: who asked, what waits for a parent, what to serve. */
export function ExtrasTodayPanel({ nurseryId, thisMonth }: { nurseryId: string; thisMonth: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const query = useKitchenSales(nurseryId, thisMonth);
  const requests = sortRequests(query.data?.requestsToday ?? []);
  const name = (ar: string | null, en: string | null) => (isArabic ? ar || en : en || ar) || '—';

  return (
    <TableCard title={t('kitchenSales.extras.todayTitle')} count={t('kitchenSales.extras.count', { count: requests.length })}>
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <p role="alert" className="p-4 text-sm text-error">{t(kitchenErrorKey(query.error))}</p>
      ) : !requests.length ? (
        <TableEmpty icon="cookie" title={t('kitchenSales.extras.noneToday')} description={t('kitchenSales.extras.noneTodayHint')} />
      ) : (
        <ul className="divide-y divide-outline-variant" data-testid="extras-today">
          {requests.map((r) => {
            const look = REQUEST_LOOK[r.status];
            const child = name(r.nameAr, r.nameEn);
            return (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                    <MaterialSymbol name={r.source === 'parent' ? 'family_restroom' : 'badge'} size="text-lg" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-on-surface">
                      <span className="font-semibold">{child}</span> · {r.itemName} × {r.quantity}
                    </span>
                    <span className="block text-xs text-on-surface-variant">
                      {[name(r.classAr, r.classEn), t(`kitchenSales.extras.sources.${r.source}`), r.note].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={look.tone} icon={look.icon}>{t(`kitchenSales.extras.statuses.${r.status}`)}</StatusPill>
                  <ExtraActions request={r} childName={child} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </TableCard>
  );
}
