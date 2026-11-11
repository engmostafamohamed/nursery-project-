import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DataTable, TableCard, TableEmpty, TableLoading, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useMoney } from '@/features/kitchen-sales/kitchenLook';
import { MonthSwitcher } from '@/features/kitchen-sales/MonthSwitcher';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { HISTORY_KINDS, sectionOf, type HistoryKind, type StockScope, type StockSection } from './kitchen';
import { stockErrorKey } from './mealPlansApi';
import { localName } from '@/lib/bilingualName';
import { KIND_LOOK, useMovementDetails } from './stockLook';
import { useStockHistory } from './useMealPlansAndKitchen';

const PAGE = 50;

/**
 * A month of the stock: what came in (deliveries and what they cost), what went out (issued to the
 * classes, used, sold) and what was thrown away, at cost; which classes took what; each category's
 * figures; and every movement, filtered by what happened, section or item.
 */
export function StockHistoryPanel({ nurseryId, scope, thisMonth }: { nurseryId: string; scope: StockScope; thisMonth: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = useMoney();
  const details = useMovementDetails();
  const [month, setMonth] = useState(thisMonth);
  const [kind, setKind] = useState<HistoryKind | 'all'>('all');
  const [section, setSection] = useState<StockSection | 'all'>('all');
  const [search, setSearch] = useState('');
  // A busy month has hundreds of movements: they show a page at a time.
  const [limit, setLimit] = useState(PAGE);
  const query = useStockHistory(nurseryId, scope, month);
  const data = query.data;
  const filterBy = <T,>(set: (v: T) => void) => (v: T) => { set(v); setLimit(PAGE); };

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.movements ?? []).filter((m) =>
      (kind === 'all' || m.kind === kind)
      && (section === 'all' || (m.category ? sectionOf(m.category) === section : false))
      && (!term || m.itemName.toLowerCase().includes(term)));
  }, [data?.movements, kind, section, search]);
  const s = data?.summary;
  const outValue = s ? s.issuedValue + s.usedValue : 0;
  const topClassValue = Math.max(1, ...(data?.byClass ?? []).map((c) => c.value));

  return (
    <div className="space-y-5" data-testid="stock-history-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} max={thisMonth} onChange={filterBy(setMonth)} />
        {query.isFetching && data ? <span className="text-xs text-on-surface-variant">{t('common.loading')}</span> : null}
      </div>

      {query.isError ? (
        <LoadError message={t(stockErrorKey(query.error))} onRetry={() => void query.refetch()} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon="local_shipping" tone="success" label={t('stock.month.received')} value={s ? money(s.receivedValue) : '—'}
          helper={s ? t('stock.month.deliveries', { count: s.deliveries }) : undefined} />
        <StatTile icon="outbox" tone="primary" label={t('stock.month.out')} value={s ? money(outValue) : '—'}
          helper={s ? t('stock.month.outHint', { issued: money(s.issuedValue), used: money(s.usedValue) }) : undefined} />
        <StatTile icon="delete" tone={s?.spoiledValue ? 'error' : 'neutral'} label={t('stock.month.spoiled')} value={s ? money(s.spoiledValue) : '—'} />
        <StatTile icon="point_of_sale" tone="neutral" label={t('stock.month.sales')} value={s ? money(s.salesNet) : '—'} helper={t('stock.month.salesHint')} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <TableCard title={t('stock.byClass.title')} description={t('stock.byClass.hint')}>
          {query.isPending ? <TableLoading /> : !data?.byClass.length ? (
            <TableEmpty icon="groups" title={t('stock.byClass.empty')} />
          ) : (
            <ul className="divide-y divide-outline-variant" data-testid="stock-by-class">
              {data.byClass.map((c) => (
                <li key={c.classId ?? 'staff'} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-on-surface">{c.classId ? localName(c.nameAr, c.nameEn, isArabic) : t('stock.byClass.staffOnly')}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-on-surface">{money(c.value)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((c.value / topClassValue) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">{t('stock.byClass.line', { issues: t('stock.byClass.issues', { count: c.issues }), items: t('stock.byClass.items', { count: c.items }) })}</p>
                </li>
              ))}
            </ul>
          )}
        </TableCard>

        <TableCard title={t('stock.byCategory.title')}>
          {query.isPending ? <TableLoading /> : !data?.byCategory.length ? (
            <TableEmpty icon="category" title={t('stock.byCategory.empty')} />
          ) : (
            <DataTable minWidth={420}>
              <THead>
                <Th>{t('fnb.kitchen.category')}</Th>
                <Th align="end">{t('stock.byCategory.in')}</Th>
                <Th align="end">{t('stock.byCategory.out')}</Th>
                <Th align="end">{t('stock.byCategory.spoiled')}</Th>
              </THead>
              <TBody>
                {data.byCategory.map((c) => (
                  <Tr key={c.category}>
                    <Td className="font-medium text-on-surface">{t(`fnb.kitchen.categories.${c.category}`)}</Td>
                    <Td align="end" className="tabular-nums">{money(c.inValue)}</Td>
                    <Td align="end" className="tabular-nums">{money(c.outValue)}</Td>
                    <Td align="end" className={cn('tabular-nums', c.spoiledValue > 0 && 'text-error')}>{money(c.spoiledValue)}</Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          )}
        </TableCard>
      </div>

      <TableCard
        title={t('stock.history.title')}
        count={t('fnb.kitchen.historyCount', { count: shown.length })}
        filters={
          <FilterBar onClear={() => { setKind('all'); setSection('all'); setSearch(''); setLimit(PAGE); }} canClear={kind !== 'all' || section !== 'all' || Boolean(search)}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={filterBy(setSearch)} placeholder={t('stock.searchPlaceholder')} />
            </FilterField>
            <FilterField label={t('fnb.kitchen.why')}>
              <Select value={kind} onChange={(e) => filterBy(setKind)(e.target.value as HistoryKind | 'all')}>
                <option value="all">{t('stock.history.allKinds')}</option>
                {HISTORY_KINDS.map((k) => <option key={k} value={k}>{t(`fnb.kitchen.kinds.${k}`)}</option>)}
              </Select>
            </FilterField>
            {scope === 'all' ? (
              <FilterField label={t('stock.sections.label')}>
                <Select value={section} onChange={(e) => filterBy(setSection)(e.target.value as StockSection | 'all')}>
                  <option value="all">{t('stock.sections.both')}</option>
                  <option value="kitchen">{t('stock.sections.kitchen')}</option>
                  <option value="store">{t('stock.sections.store')}</option>
                </Select>
              </FilterField>
            ) : null}
          </FilterBar>
        }
      >
        {query.isPending ? <TableLoading /> : !shown.length ? (
          <TableEmpty icon="history" title={data?.movements.length ? t('fnb.kitchen.emptyFiltered') : t('stock.history.empty')} />
        ) : (
          <>
          <DataTable minWidth={900}>
            <THead>
              <Th>{t('stock.history.when')}</Th>
              <Th>{t('fnb.kitchen.columns.item')}</Th>
              <Th>{t('fnb.kitchen.why')}</Th>
              <Th align="end">{t('stock.history.change')}</Th>
              <Th>{t('stock.history.details')}</Th>
              <Th align="end">{t('stock.history.worth')}</Th>
            </THead>
            <TBody>
              {shown.slice(0, limit).map((m) => {
                const look = KIND_LOOK[m.kind];
                const d = details(m);
                return (
                  <Tr key={m.id} data-testid="history-row">
                    <Td className="whitespace-nowrap text-xs text-on-surface-variant">{formatDateTime(m.at)}</Td>
                    <Td>
                      <span className="block font-medium text-on-surface">{m.itemName}</span>
                      {m.category ? <span className="block text-xs text-on-surface-variant">{t(`fnb.kitchen.categories.${m.category}`)}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-sm text-on-surface">
                        <MaterialSymbol name={look.icon} size="text-lg" className={look.tone} />
                        {t(`fnb.kitchen.kinds.${m.kind}`)}
                      </span>
                    </Td>
                    <Td align="end" className="whitespace-nowrap">
                      <span className={cn('font-semibold tabular-nums', m.change >= 0 ? 'text-success' : 'text-error')} dir="ltr">{m.change >= 0 ? '+' : ''}{m.change}</span>
                      <span className="ms-1 text-xs text-on-surface-variant">{m.unit}</span>
                      <span className="block text-[11px] text-on-surface-variant">{t('fnb.kitchen.leftAfter', { quantity: m.quantityAfter, unit: m.unit })}</span>
                    </Td>
                    <Td className="text-xs text-on-surface-variant">
                      {d.to ? <span className="block text-on-surface">{d.to}</span> : null}
                      {[d.by, m.note].filter(Boolean).join(' · ')}
                    </Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-on-surface">{d.value || '—'}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant px-4 py-3 text-xs text-on-surface-variant sm:px-5">
            <span>{t('stock.history.showing', { shown: Math.min(limit, shown.length), total: shown.length })}</span>
            {shown.length > limit ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)} data-testid="history-more">
                <MaterialSymbol name="expand_more" size="text-base" className="me-1" />
                {t('stock.history.more', { count: Math.min(PAGE, shown.length - limit) })}
              </Button>
            ) : null}
          </div>
          </>
        )}
      </TableCard>
    </div>
  );
}
