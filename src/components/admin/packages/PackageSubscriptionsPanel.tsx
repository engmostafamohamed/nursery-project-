import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PeriodFilter } from '@/components/admin/PeriodFilter';
import { Button } from '@/components/ui/button';
import { TableCard } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useMoney } from '@/hooks/useMoney';
import type { PackageSubscriptionsView } from '@/hooks/usePackageSubscriptionsView';
import { ALL_TIME_PERIODS } from '@/lib/attendancePeriods';
import { rowsForTile, summarize, type PackageKind, type SubscriptionTile } from '@/lib/packageSubscriptions';
import { cn } from '@/lib/utils';

import { SubscriptionsTable } from './SubscriptionsTable';

type Props = {
  /** The page's subscriptions; the package cards below show each package's share of them. */
  view: PackageSubscriptionsView;
  /** Where the admin's pages live: /admin, or /xo-admin/nursery for XO staff. */
  basePath?: string;
};

type TotalsTile = Exclude<SubscriptionTile, `package:${string}`>;

const KINDS: Array<'all' | PackageKind> = ['all', 'tuition', 'extra_hours'];

/**
 * Where the money stands for all the packages: the totals (subscriptions, billed, paid, awaiting
 * confirmation, unpaid) for all time or a period. Each number opens the subscriptions it counts in
 * a table that can be filtered further; a row opens the child's billing. Each package's own numbers
 * sit on its card.
 */
export function PackageSubscriptionsPanel({ view, basePath = '/admin' }: Props) {
  const { t } = useTranslation();
  const { period, query } = view;
  const [kind, setKind] = useState<'all' | PackageKind>('all');
  const [selected, setSelected] = useState<TotalsTile | null>(null);
  const money = useMoney();

  const rows = useMemo(() => view.rows.filter((row) => kind === 'all' || row.kind === kind), [view.rows, kind]);
  const totals = useMemo(() => summarize(rows), [rows]);

  const select = (tile: TotalsTile) => setSelected((current) => (current === tile ? null : tile));
  const pick = (tile: TotalsTile) => ({ onClick: () => select(tile), active: selected === tile, className: 'xl:flex-col xl:items-start xl:gap-2' });
  const tileTitle = (tile: TotalsTile): string => {
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

  return (
    <TableCard
      title={t('packageSubscriptions.title')}
      count={view.periodLabel}
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

function kindName(t: ReturnType<typeof useTranslation>['t'], kind: 'all' | PackageKind): string {
  if (kind === 'tuition') return t('packageSubscriptions.kind.tuition');
  if (kind === 'extra_hours') return t('packageSubscriptions.kind.extra_hours');
  return t('packageSubscriptions.kind.all');
}
