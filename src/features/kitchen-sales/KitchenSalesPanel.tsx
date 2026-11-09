import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TableLoading, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { formatDay } from '@/lib/datetime';

import { CancelChargeDialog } from './CancelChargeDialog';
import { BILLING_LOOK, useMoney } from './kitchenLook';
import { canCancelCharge, filterCharges, salesTotals, type ChargeFilter, type KitchenCharge } from './kitchenSales';
import { kitchenErrorKey } from './kitchenSalesApi';
import { MonthSwitcher } from './MonthSwitcher';
import { useKitchenSales } from './useKitchenSales';

/**
 * The kitchen's sales for a month: what was charged, to whom, with which discount and how it is
 * billed (on the family's invoice, or open until a payslip deducts it); staff balances still open;
 * and cancelling a charge made by mistake.
 */
export function KitchenSalesPanel({ nurseryId, thisMonth }: { nurseryId: string; thisMonth: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const [month, setMonth] = useState(thisMonth);
  const [who, setWho] = useState<ChargeFilter>('all');
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<KitchenCharge | null>(null);
  const query = useKitchenSales(nurseryId, month);
  const data = query.data;
  const totals = useMemo(() => salesTotals(data?.charges ?? []), [data?.charges]);
  const shown = useMemo(() => filterCharges(data?.charges ?? [], who, search), [data?.charges, who, search]);
  const name = (ar: string | null, en: string | null) => (isArabic ? ar || en : en || ar) || '—';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} max={thisMonth} onChange={setMonth} />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon="point_of_sale" label={t('kitchenSales.sales.tiles.net')} value={money(totals.net)} helper={t('kitchenSales.sales.tiles.count', { count: totals.count })} />
        <StatTile icon="sell" tone="success" label={t('kitchenSales.sales.tiles.discounts')} value={money(totals.discount)} />
        <StatTile icon="child_care" tone="primary" label={t('kitchenSales.sales.tiles.children')} value={money(totals.children)} helper={t('kitchenSales.sales.tiles.childrenHint')} />
        <StatTile icon="badge" tone={totals.staffOpen ? 'warning' : 'neutral'} label={t('kitchenSales.sales.tiles.staff')} value={money(totals.staff)}
          helper={totals.staffOpen ? t('kitchenSales.sales.tiles.staffOpen', { amount: money(totals.staffOpen) }) : t('kitchenSales.sales.tiles.staffHint')} />
      </div>

      <TableCard
        title={t('kitchenSales.sales.title')}
        count={t('kitchenSales.sales.count', { count: shown.length })}
        filters={
          <FilterBar onClear={() => { setWho('all'); setSearch(''); }} canClear={who !== 'all' || Boolean(search)}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('kitchenSales.sales.searchPlaceholder')} />
            </FilterField>
            <FilterField label={t('kitchenSales.sales.who')}>
              <Select value={who} onChange={(e) => setWho(e.target.value as ChargeFilter)}>
                <option value="all">{t('kitchenSales.sales.everyone')}</option>
                <option value="child">{t('kitchenSales.charge.child')}</option>
                <option value="staff">{t('kitchenSales.charge.staff')}</option>
              </Select>
            </FilterField>
          </FilterBar>
        }
      >
        {query.isPending ? (
          <TableLoading />
        ) : query.isError ? (
          <p role="alert" className="p-4 text-sm text-error">{t(kitchenErrorKey(query.error))}</p>
        ) : !shown.length ? (
          <TableEmpty icon="point_of_sale" title={data?.charges.length ? t('kitchenSales.sales.emptyFiltered') : t('kitchenSales.sales.empty')} description={data?.charges.length ? undefined : t('kitchenSales.sales.emptyHint')} />
        ) : (
          <DataTable minWidth={960}>
            <THead>
              <Th>{t('kitchenSales.sales.columns.date')}</Th>
              <Th>{t('kitchenSales.sales.columns.who')}</Th>
              <Th>{t('kitchenSales.sales.columns.item')}</Th>
              <Th align="end">{t('kitchenSales.sales.columns.price')}</Th>
              <Th>{t('kitchenSales.sales.columns.discount')}</Th>
              <Th align="end">{t('kitchenSales.sales.columns.net')}</Th>
              <Th>{t('kitchenSales.sales.columns.billing')}</Th>
              <Th align="end">{t('health.dashboard.columns.actions')}</Th>
            </THead>
            <TBody>
              {shown.map((c) => {
                const look = BILLING_LOOK[c.billing];
                return (
                  <Tr key={c.id} className={c.billing === 'cancelled' ? 'opacity-60' : undefined}>
                    <Td className="whitespace-nowrap text-on-surface-variant">{formatDay(c.chargedOn, { day: 'numeric', month: 'short' })}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <MaterialSymbol name={c.consumer === 'child' ? 'child_care' : 'badge'} size="text-lg" className="text-on-surface-variant" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-on-surface">{name(c.nameAr, c.nameEn)}</span>
                          <span className="block text-xs text-on-surface-variant">{c.consumer === 'child' ? name(c.classAr, c.classEn) : t('kitchenSales.charge.staff')}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="block font-medium text-on-surface">{c.itemName}</span>
                      <span className="block text-xs text-on-surface-variant" dir="auto">{c.quantity} {c.unit} × {money(c.unitPrice)}</span>
                    </Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums">{money(c.gross)}</Td>
                    <Td>
                      {c.discountAmount > 0 ? (
                        <span className="text-sm text-success">
                          −{money(c.discountAmount)}
                          <span className="block text-xs text-on-surface-variant">{name(c.discountNameAr, c.discountNameEn)} · {c.discountPercent}%</span>
                        </span>
                      ) : <span className="text-on-surface-variant">—</span>}
                    </Td>
                    <Td align="end" className="whitespace-nowrap font-semibold tabular-nums">{money(c.net)}</Td>
                    <Td>
                      <StatusPill tone={look.tone} icon={look.icon}>{t(`kitchenSales.billing.${c.billing}`)}</StatusPill>
                      {c.cancelReason ? <span className="mt-0.5 block text-xs text-on-surface-variant">{c.cancelReason}</span> : null}
                    </Td>
                    <Td align="end">
                      {canCancelCharge(c) ? <IconAction icon="undo" danger label={t('kitchenSales.sales.cancelAction', { item: c.itemName })} onClick={() => setCancelling(c)} /> : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      {data?.staffOpen.length ? (
        <TableCard title={t('kitchenSales.sales.staffOpenTitle')} description={t('kitchenSales.sales.staffOpenHint')}>
          <ul className="divide-y divide-outline-variant" data-testid="staff-open">
            {data.staffOpen.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="flex items-center gap-2">
                  <MaterialSymbol name="badge" size="text-lg" className="text-on-surface-variant" />
                  <span className="font-medium text-on-surface">{name(s.nameAr, s.nameEn)}</span>
                </span>
                <span className="font-semibold tabular-nums text-warning">{money(s.open)}</span>
              </li>
            ))}
          </ul>
        </TableCard>
      ) : null}

      {cancelling ? <CancelChargeDialog charge={cancelling} onClose={() => setCancelling(null)} /> : null}
    </div>
  );
}
