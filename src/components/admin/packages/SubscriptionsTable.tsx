import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusPill,
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
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { useMoney } from '@/hooks/useMoney';
import { usePagination } from '@/hooks/usePagination';
import { localName } from '@/lib/bilingualName';
import {
  BILLING_PERIODS,
  filterSubscriptions,
  hasFilters,
  NO_FILTERS,
  PAYMENT_STATES,
  paymentState,
  sortSubscriptions,
  summarize,
  type BillingPeriodKind,
  type PaymentState,
  type SubscriptionFilters,
  type SubscriptionRow,
  type SubscriptionSortKey,
} from '@/lib/packageSubscriptions';

type T = ReturnType<typeof useTranslation>['t'];

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

/**
 * The subscriptions behind a number, filtered further by name, package, status, money and billing
 * period; a row opens the child's billing. Without `title` or `onClose` (inside a dialog that has
 * its own) the heading shows just the count and the money.
 */
export function SubscriptionsTable({
  rows,
  title,
  basePath,
  onClose,
}: {
  rows: SubscriptionRow[];
  title?: string;
  basePath: string;
  onClose?: () => void;
}) {
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
      if (!seen.has(row.package_id)) seen.set(row.package_id, (localName(row.package_name_ar, row.package_name_en, ar)) || '—');
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
            {title ? (
              <>
                <MaterialSymbol name="list_alt" className="text-base text-primary" />
                {title}
              </>
            ) : null}
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
        {onClose ? (
          <Button type="button" variant="ghost" size="icon" aria-label={t('packageSubscriptions.details.close')} onClick={onClose}>
            <MaterialSymbol name="close" />
          </Button>
        ) : null}
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
