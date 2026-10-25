import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { PeriodFilter } from '@/components/admin/PeriodFilter';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusPill,
  TableCard,
  TableEmpty,
  TablePagination,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { usePackageSubscriptions } from '@/hooks/usePackageSubscriptions';
import { usePagination } from '@/hooks/usePagination';
import { usePeriodState } from '@/hooks/usePeriodState';
import { ALL_TIME_PERIODS, rangeLabel } from '@/lib/attendancePeriods';
import { formatMoneyAmount } from '@/lib/money';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import {
  BILLING_PERIODS,
  byPackage,
  filterSubscriptions,
  hasFilters,
  NO_FILTERS,
  PAYMENT_STATES,
  paymentState,
  rowsForTile,
  sortSubscriptions,
  summarize,
  type BillingPeriodKind,
  type CatalogPackage,
  type PackageKind,
  type PackageSummary,
  type PaymentState,
  type SubscriptionFilters,
  type SubscriptionRow,
  type SubscriptionSortKey,
  type SubscriptionTile,
} from '@/lib/packageSubscriptions';
import { cn } from '@/lib/utils';

type Props = {
  nurseryId: string | null | undefined;
  /** The nursery's packages, so a package nobody has taken still shows. */
  catalog: CatalogPackage[];
  /** Where the admin's pages live: /admin, or /xo-admin/nursery for XO staff. */
  basePath?: string;
};

const KINDS: Array<'all' | PackageKind> = ['all', 'tuition', 'extra_hours'];

/**
 * Who is subscribed to each package and where the money stands: the totals (subscriptions, billed,
 * paid, awaiting confirmation, unpaid) and one tile per package, for all time or a period. Each tile
 * opens the subscriptions it counts in a table that can be filtered further; a row opens the
 * child's billing.
 */
export function PackageSubscriptionsPanel({ nurseryId, catalog, basePath = '/admin' }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
  const [today] = useState(() => getNurseryCalendarDateString());
  const period = usePeriodState('all', today);
  const [kind, setKind] = useState<'all' | PackageKind>('all');
  const [selected, setSelected] = useState<SubscriptionTile | null>(null);
  const query = usePackageSubscriptions(nurseryId, period.range, period.valid);
  const money = useMoney();

  const rows = useMemo(() => (query.data ?? []).filter((row) => kind === 'all' || row.kind === kind), [query.data, kind]);
  const totals = useMemo(() => summarize(rows), [rows]);
  const packages = useMemo(() => byPackage(rows, catalog.filter((pkg) => kind === 'all' || pkg.kind === kind)), [rows, catalog, kind]);

  const select = (tile: SubscriptionTile) => setSelected((current) => (current === tile ? null : tile));
  const pick = (tile: SubscriptionTile) => ({ onClick: () => select(tile), active: selected === tile, className: 'xl:flex-col xl:items-start xl:gap-2' });
  const packageName = (summary: Pick<PackageSummary, 'nameAr' | 'nameEn'>) =>
    (i18n.language.startsWith('ar') ? summary.nameAr || summary.nameEn : summary.nameEn || summary.nameAr) || '—';
  const tileTitle = (tile: SubscriptionTile): string => {
    if (tile.startsWith('package:')) {
      const summary = packages.find((p) => `package:${p.packageId}` === tile);
      return summary ? packageName(summary) : t('packageSubscriptions.tiles.subscriptions');
    }
    switch (tile) {
      case 'billed':
        return t('packageSubscriptions.tiles.billed');
      case 'paid':
        return t('packageSubscriptions.tiles.paid');
      case 'awaiting':
        return t('packageSubscriptions.tiles.awaiting');
      case 'unpaid':
        return t('packageSubscriptions.tiles.unpaid');
      default:
        return t('packageSubscriptions.tiles.subscriptions');
    }
  };
  const paidPercent = totals.billed > 0 ? Math.round((totals.paid / totals.billed) * 100) : 0;
  const shown = period.shown;

  return (
    <TableCard
      title={t('packageSubscriptions.title')}
      count={period.choice === 'all' ? t('periodFilter.all') : shown && shown.from <= shown.to ? rangeLabel(shown, locale) : undefined}
      description={t('packageSubscriptions.description')}
      filters={
        <div className="space-y-3">
          <PeriodFilter state={period} choices={ALL_TIME_PERIODS} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-on-surface-variant">{t('packageSubscriptions.kind.label')}</span>
            <FilterChips
              value={kind}
              onChange={(next) => {
                setKind(next);
                setSelected(null);
              }}
              label={t('packageSubscriptions.kind.label')}
              options={KINDS.map((value) => ({ value, label: kindName(t, value) }))}
            />
          </div>
        </div>
      }
    >
      {!period.valid ? (
        <p className="px-4 py-6 text-sm text-on-surface-variant sm:px-5">{t('periodFilter.chooseDates')}</p>
      ) : query.isPending ? (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
        </div>
      ) : query.isError ? (
        <div className="m-4 flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-sm text-error sm:m-5" role="alert">
          <MaterialSymbol name="error" className="text-xl" />
          <span className="flex-1">{t('packageSubscriptions.loadError')}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData}>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-5">
            <StatTile
              {...pick('subscriptions')}
              icon="card_membership"
              label={t('packageSubscriptions.tiles.subscriptions')}
              value={totals.subscriptions}
              helper={t('packageSubscriptions.tiles.people', { children: totals.children, parents: totals.parents })}
            />
            <StatTile
              {...pick('billed')}
              icon="request_quote"
              label={t('packageSubscriptions.tiles.billed')}
              value={money(totals.billed)}
              helper={totals.notInvoiced > 0 ? t('packageSubscriptions.tiles.notInvoiced', { count: totals.notInvoiced }) : undefined}
            />
            <StatTile
              {...pick('paid')}
              icon="price_check"
              label={t('packageSubscriptions.tiles.paid')}
              value={money(totals.paid)}
              tone="success"
              helper={t('packageSubscriptions.tiles.paidShare', { percent: paidPercent })}
            />
            <StatTile
              {...pick('awaiting')}
              icon="hourglass_top"
              label={t('packageSubscriptions.tiles.awaiting')}
              value={money(totals.awaiting)}
              tone={totals.awaiting > 0 ? 'warning' : 'neutral'}
              helper={t('packageSubscriptions.tiles.awaitingHint')}
            />
            <StatTile
              {...pick('unpaid')}
              icon="money_off"
              label={t('packageSubscriptions.tiles.unpaid')}
              value={money(totals.unpaid)}
              tone={totals.unpaid > 0 ? 'error' : 'success'}
              helper={totals.overdue > 0 ? t('packageSubscriptions.tiles.overdue', { amount: money(totals.overdue) }) : undefined}
            />
          </div>

          <div className="border-t border-outline-variant px-4 py-4 sm:px-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface">
              <MaterialSymbol name="package_2" className="text-base text-primary" />
              {t('packageSubscriptions.byPackage')}
            </h3>
            {packages.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {packages.map((summary) => (
                  <PackageTile
                    key={summary.packageId}
                    summary={summary}
                    name={packageName(summary)}
                    active={selected === `package:${summary.packageId}`}
                    onClick={() => select(`package:${summary.packageId}`)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">{t('packageSubscriptions.noPackages')}</p>
            )}
          </div>

          {selected ? (
            <SubscriptionsTable
              key={`${selected}|${kind}|${period.range?.from ?? ''}|${period.range?.to ?? ''}`}
              rows={rowsForTile(selected, rows)}
              title={tileTitle(selected)}
              basePath={basePath}
              onClose={() => setSelected(null)}
            />
          ) : (
            <p className="flex items-center gap-1.5 border-t border-outline-variant px-4 py-3 text-xs text-on-surface-variant sm:px-5">
              <MaterialSymbol name="touch_app" className="text-sm" />
              {t('packageSubscriptions.hint')}
            </p>
          )}
        </div>
      )}
    </TableCard>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function kindName(t: T, kind: 'all' | PackageKind): string {
  if (kind === 'tuition') return t('packageSubscriptions.kind.tuition');
  if (kind === 'extra_hours') return t('packageSubscriptions.kind.extra_hours');
  return t('packageSubscriptions.kind.all');
}

function useMoney() {
  const { t } = useTranslation();
  return (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(Number(amount ?? 0)) });
}

/** A package: how many subscriptions, children and parents, and how much of its money is paid. */
function PackageTile({ summary, name, active, onClick }: { summary: PackageSummary; name: string; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const money = useMoney();
  const share = summary.billed > 0 ? Math.min(100, Math.round((summary.paid / summary.billed) * 100)) : 0;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-xl border border-outline-variant bg-surface p-4 text-start shadow-sm outline-none transition hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/30',
        active && 'border-primary bg-primary/5 ring-1 ring-primary',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-semibold text-on-surface">{name}</span>
        <StatusPill tone={summary.kind === 'tuition' ? 'primary' : 'warning'} icon={summary.kind === 'tuition' ? 'school' : 'more_time'}>
          {summary.kind === 'tuition' ? t('packageSubscriptions.kindShort.tuition') : t('packageSubscriptions.kindShort.extra_hours')}
        </StatusPill>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className={cn('text-2xl font-bold tabular-nums', summary.subscriptions ? 'text-on-surface' : 'text-on-surface-variant')}>{summary.subscriptions}</span>
        <span className="text-xs text-on-surface-variant">{t('packageSubscriptions.subscriptionsWord')}</span>
        {!summary.offered ? <span className="ms-auto text-xs font-medium text-on-surface-variant">{t('packageSubscriptions.notOffered')}</span> : null}
      </span>
      <span className="text-xs text-on-surface-variant">{t('packageSubscriptions.tiles.people', { children: summary.children, parents: summary.parents })}</span>
      <span className="space-y-1">
        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-high" aria-hidden>
          <span className="block h-full rounded-full bg-success" style={{ width: `${share}%` }} />
        </span>
        <span className="block text-xs text-on-surface-variant">
          {summary.billed > 0
            ? t('packageSubscriptions.packagePaid', { paid: money(summary.paid), billed: money(summary.billed) })
            : summary.notInvoiced > 0
              ? t('packageSubscriptions.tiles.notInvoiced', { count: summary.notInvoiced })
              : t('packageSubscriptions.noInvoices')}
          {summary.unpaid > 0 ? <span className="text-error"> · {t('packageSubscriptions.packageUnpaid', { amount: money(summary.unpaid) })}</span> : null}
        </span>
      </span>
    </button>
  );
}

const PAYMENT_TONE: Record<PaymentState, PillTone> = {
  paid: 'success',
  awaiting: 'warning',
  unpaid: 'warning',
  overdue: 'error',
  not_invoiced: 'neutral',
  nothing_due: 'neutral',
};

function paymentLabel(t: T, state: PaymentState): string {
  switch (state) {
    case 'paid':
      return t('packageSubscriptions.payment.paid');
    case 'awaiting':
      return t('packageSubscriptions.payment.awaiting');
    case 'unpaid':
      return t('packageSubscriptions.payment.unpaid');
    case 'overdue':
      return t('packageSubscriptions.payment.overdue');
    case 'not_invoiced':
      return t('packageSubscriptions.payment.not_invoiced');
    case 'nothing_due':
      return t('packageSubscriptions.payment.nothing_due');
  }
}

function billingPeriodLabel(t: T, period: BillingPeriodKind): string {
  switch (period) {
    case 'monthly':
      return t('applications.paymentPackage.period.monthly');
    case 'quarterly':
      return t('applications.paymentPackage.period.quarterly');
    case 'half_annual':
      return t('applications.paymentPackage.period.halfAnnual');
    case 'annual':
      return t('applications.paymentPackage.period.annual');
  }
}

/** The subscriptions behind a number, filtered further by name, package, status, money and billing period. */
function SubscriptionsTable({ rows, title, basePath, onClose }: { rows: SubscriptionRow[]; title: string; basePath: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const navigate = useNavigate();
  const money = useMoney();
  const [filters, setFilters] = useState<SubscriptionFilters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SubscriptionSortKey; direction: 'asc' | 'desc' }>({ key: 'child', direction: 'asc' });

  const pick = (ar: string | null, en: string | null) => (lang.startsWith('ar') ? ar || en : en || ar) || '—';
  const date = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const shown = useMemo(() => sortSubscriptions(filterSubscriptions(rows, filters), sort.key, sort.direction, lang), [rows, filters, sort, lang]);
  const sums = summarize(shown);
  const pager = usePagination(shown, 20, JSON.stringify(filters) + sort.key + sort.direction);
  const packageOptions = useMemo(() => {
    const ar = lang.startsWith('ar');
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.package_id)) seen.set(row.package_id, (ar ? row.package_name_ar || row.package_name_en : row.package_name_en || row.package_name_ar) || '—');
    }
    return [...seen];
  }, [rows, lang]);
  const hasTuition = rows.some((row) => row.kind === 'tuition');
  const set = (patch: Partial<SubscriptionFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const sortBy = (key: SubscriptionSortKey) => ({
    active: sort.key === key,
    direction: sort.direction,
    onToggle: () =>
      setSort((current) =>
        current.key === key
          ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
          : { key, direction: key === 'child' || key === 'package' ? 'asc' : 'desc' },
      ),
  });

  return (
    <section className="border-t border-outline-variant" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
            <MaterialSymbol name="list_alt" className="text-base text-primary" />
            {title}
            <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
              {t('packageSubscriptions.details.count', { count: shown.length })}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {t('packageSubscriptions.details.totals', {
              billed: money(sums.billed),
              paid: money(sums.paid),
              awaiting: money(sums.awaiting),
              unpaid: money(sums.unpaid),
            })}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t('packageSubscriptions.details.close')} onClick={onClose}>
          <MaterialSymbol name="close" />
        </Button>
      </div>

      <div className="border-y border-outline-variant px-4 py-3 sm:px-5">
        <FilterBar onClear={() => setFilters(NO_FILTERS)} canClear={hasFilters(filters)}>
          <FilterField label={t('packageSubscriptions.filters.search')} className="sm:flex-[2]">
            <SearchInput value={filters.search} onChange={(search) => set({ search })} placeholder={t('packageSubscriptions.filters.searchPlaceholder')} />
          </FilterField>
          {packageOptions.length > 1 ? (
            <FilterField label={t('packageSubscriptions.filters.package')}>
              <Select value={filters.packageId} onChange={(e) => set({ packageId: e.target.value })}>
                <option value="all">{t('packageSubscriptions.filters.allPackages')}</option>
                {packageOptions.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </Select>
            </FilterField>
          ) : null}
          <FilterField label={t('packageSubscriptions.filters.status')}>
            <Select value={filters.status} onChange={(e) => set({ status: e.target.value as SubscriptionFilters['status'] })}>
              <option value="all">{t('packageSubscriptions.filters.all')}</option>
              <option value="active">{t('packageSubscriptions.status.active')}</option>
              <option value="ended">{t('packageSubscriptions.filters.ended')}</option>
            </Select>
          </FilterField>
          <FilterField label={t('packageSubscriptions.filters.payment')}>
            <Select value={filters.payment} onChange={(e) => set({ payment: e.target.value as SubscriptionFilters['payment'] })}>
              <option value="all">{t('packageSubscriptions.filters.all')}</option>
              {PAYMENT_STATES.map((state) => (
                <option key={state} value={state}>{paymentLabel(t, state)}</option>
              ))}
            </Select>
          </FilterField>
          {hasTuition ? (
            <FilterField label={t('packageSubscriptions.filters.billingPeriod')}>
              <Select value={filters.billingPeriod} onChange={(e) => set({ billingPeriod: e.target.value as SubscriptionFilters['billingPeriod'] })}>
                <option value="all">{t('packageSubscriptions.filters.all')}</option>
                {BILLING_PERIODS.map((value) => (
                  <option key={value} value={value}>{billingPeriodLabel(t, value)}</option>
                ))}
              </Select>
            </FilterField>
          ) : null}
        </FilterBar>
      </div>

      {!shown.length ? (
        <TableEmpty icon="inbox" title={rows.length ? t('packageSubscriptions.details.noMatch') : t('packageSubscriptions.details.noRows')} />
      ) : (
        <>
          <DataTable minWidth={1080}>
            <THead>
              <Th sort={sortBy('child')}>{t('packageSubscriptions.columns.child')}</Th>
              <Th>{t('packageSubscriptions.columns.parent')}</Th>
              <Th sort={sortBy('package')}>{t('packageSubscriptions.columns.package')}</Th>
              <Th sort={sortBy('started')}>{t('packageSubscriptions.columns.status')}</Th>
              <Th align="end" sort={sortBy('billed')}>{t('packageSubscriptions.columns.billed')}</Th>
              <Th align="end" sort={sortBy('paid')}>{t('packageSubscriptions.columns.paid')}</Th>
              <Th align="end">{t('packageSubscriptions.columns.awaiting')}</Th>
              <Th align="end" sort={sortBy('unpaid')}>{t('packageSubscriptions.columns.unpaid')}</Th>
              <Th>{t('packageSubscriptions.columns.payment')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((row) => {
                const state = paymentState(row);
                return (
                  <Tr key={row.subscription_id} onClick={() => navigate(`${basePath}/children/${row.child_id}?tab=billing`)}>
                    <Td>
                      <p className="font-medium text-on-surface">{pick(row.child_name_ar, row.child_name_en)}</p>
                      {row.class_name_ar || row.class_name_en ? <p className="text-xs text-on-surface-variant">{pick(row.class_name_ar, row.class_name_en)}</p> : null}
                    </Td>
                    <Td>
                      <p>{pick(row.parent_name_ar, row.parent_name_en)}</p>
                      {row.parent_phone ? (
                        <a href={`tel:${row.parent_phone}`} className="text-xs font-medium text-primary hover:underline" dir="ltr">
                          {row.parent_phone}
                        </a>
                      ) : null}
                    </Td>
                    <Td>
                      <p className="font-medium text-on-surface">{pick(row.package_name_ar, row.package_name_en)}</p>
                      <p className="text-xs text-on-surface-variant">
                        {row.kind === 'tuition' && row.billing_period
                          ? t('packageSubscriptions.columns.pricePer', { period: billingPeriodLabel(t, row.billing_period), price: money(row.price) })
                          : row.included_hours
                            ? t('packageSubscriptions.columns.hoursUsed', { used: Number(row.hours_used ?? 0), included: row.included_hours })
                            : t('packageSubscriptions.columns.unlimited')}
                      </p>
                    </Td>
                    <Td>
                      <StatusPill tone={row.status === 'active' ? 'success' : 'neutral'}>
                        {row.status === 'active'
                          ? t('packageSubscriptions.status.active')
                          : row.status === 'expired'
                            ? t('packageSubscriptions.status.expired')
                            : t('packageSubscriptions.status.cancelled')}
                      </StatusPill>
                      <p className="mt-1 whitespace-nowrap text-xs text-on-surface-variant">
                        {row.ended_on
                          ? t('packageSubscriptions.columns.fromTo', { from: date(row.started_on), to: date(row.ended_on) })
                          : t('packageSubscriptions.columns.since', { date: date(row.started_on) })}
                      </p>
                    </Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums">{row.invoiced ? money(row.billed) : '—'}</Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-success">{Number(row.paid) > 0 ? money(row.paid) : '—'}</Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums text-warning">{Number(row.awaiting) > 0 ? money(row.awaiting) : '—'}</Td>
                    <Td align="end" className="whitespace-nowrap tabular-nums">
                      {Number(row.unpaid) > 0 ? <span className="font-semibold text-error">{money(row.unpaid)}</span> : '—'}
                      {Number(row.overdue) > 0 ? (
                        <p className="text-xs text-error">{t('packageSubscriptions.columns.overdue', { amount: money(row.overdue) })}</p>
                      ) : row.next_due_date && Number(row.unpaid) > 0 ? (
                        <p className="text-xs text-on-surface-variant">{t('packageSubscriptions.columns.due', { date: date(row.next_due_date) })}</p>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusPill tone={PAYMENT_TONE[state]}>{paymentLabel(t, state)}</StatusPill>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} />
        </>
      )}
    </section>
  );
}
