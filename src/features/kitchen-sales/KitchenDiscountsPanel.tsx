import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { IconAction, StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import type { KitchenItem } from '@/features/food-and-beverage/kitchen';
import { formatDay } from '@/lib/datetime';

import { DiscountDialog } from './DiscountDialog';
import { discountLive, type KitchenDiscount } from './kitchenSales';
import { kitchenErrorKey } from './kitchenSalesApi';
import { useKitchenSales } from './useKitchenSales';

/** The kitchen's discounts: for whom, on what, how much and when; each can be changed or switched off. */
export function KitchenDiscountsPanel({ nurseryId, thisMonth, items }: { nurseryId: string; thisMonth: string; items: KitchenItem[] }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const query = useKitchenSales(nurseryId, thisMonth);
  const [open, setOpen] = useState<{ discount: KitchenDiscount | null } | null>(null);
  const today = query.data?.today ?? '';
  const name = (ar: string | null, en: string | null) => (isArabic ? ar || en : en || ar) || '—';

  const whom = (d: KitchenDiscount) =>
    d.audience === 'staff_member' || d.audience === 'child'
      ? name(d.personAr, d.personEn)
      : t(`kitchenSales.discounts.audiences.${d.audience}`);

  return (
    <>
      <TableCard
        title={t('kitchenSales.discounts.title')}
        count={t('kitchenSales.discounts.count', { count: query.data?.discounts.length ?? 0 })}
        actions={
          <Button type="button" size="sm" onClick={() => setOpen({ discount: null })} disabled={!query.data} data-testid="add-discount">
            <MaterialSymbol name="add" size="text-base" className="me-1" />
            {t('kitchenSales.discounts.add')}
          </Button>
        }
      >
        {query.isPending ? (
          <TableLoading />
        ) : query.isError ? (
          <p role="alert" className="p-4 text-sm text-error">{t(kitchenErrorKey(query.error))}</p>
        ) : !query.data.discounts.length ? (
          <TableEmpty icon="sell" title={t('kitchenSales.discounts.empty')} description={t('kitchenSales.discounts.emptyHint')} />
        ) : (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3" data-testid="discount-list">
            {query.data.discounts.map((d) => {
              const live = discountLive(d, today);
              return (
                <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-on-surface">{name(d.nameAr, d.nameEn)}</p>
                      <p className="text-xs text-on-surface-variant">{whom(d)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-sm font-bold text-success">−{d.percent}%</span>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {d.itemName ?? t('kitchenSales.discounts.allItems')}
                    {d.startsOn || d.endsOn ? ` · ${d.startsOn ? formatDay(d.startsOn) : '…'} – ${d.endsOn ? formatDay(d.endsOn) : '…'}` : ''}
                  </p>
                  <div className="mt-auto flex items-center justify-between">
                    <StatusPill tone={live ? 'success' : 'neutral'}>{t(live ? 'kitchenSales.discounts.live' : d.active ? 'kitchenSales.discounts.notNow' : 'kitchenSales.discounts.off')}</StatusPill>
                    <IconAction icon="edit" label={t('kitchenSales.discounts.editNamed', { name: name(d.nameAr, d.nameEn) })} onClick={() => setOpen({ discount: d })} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </TableCard>
      {open && query.data ? (
        <DiscountDialog nurseryId={nurseryId} discount={open.discount} staff={query.data.staff} items={items} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
