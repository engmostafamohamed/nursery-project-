import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { useParentChildren, type ChildOption } from '@/hooks/useParentChildren';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';

type ChildBreakdown = {
  child: ChildOption;
  outstanding: number;
};

export function FinancialSummaryCard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const invoices = useParentInvoices({ parentId: user?.id, status: 'all', sort: 'due_soon' });
  const childrenQuery = useParentChildren();
  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);

  const getName = (c: ChildOption) =>
    i18n.language === 'ar' ? (c.nameAr || c.nameEn) : (c.nameEn || c.nameAr);

  const summary = useMemo(() => {
    const rows = invoices.allData ?? [];
    const dueRows = rows.filter((r) => (r.status === 'pending' || r.status === 'overdue') && r.balance > 0);
    const totalOutstanding = dueRows.reduce((s, r) => s + r.balance, 0);
    const nextDue = [...dueRows].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
    const hasOverdue = dueRows.some((r) => r.status === 'overdue');

    const perChild: ChildBreakdown[] = [];
    let generalDue = 0;
    if (children.length > 1) {
      for (const child of children) {
        const childDue = dueRows
          .filter((r) => r.childIds.includes(child.id))
          .reduce((s, r) => s + r.balance / Math.max(r.childIds.length, 1), 0);
        if (childDue > 0) {
          perChild.push({ child, outstanding: childDue });
        }
      }
      generalDue = dueRows
        .filter((r) => r.childIds.length === 0)
        .reduce((s, r) => s + r.balance, 0);
    }

    return { totalOutstanding, nextDue, hasOverdue, perChild, generalDue };
  }, [invoices.allData, children]);

  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const breakdown = [
    ...summary.perChild.map((item) => ({ key: item.child.id, label: getName(item.child), icon: 'child_care', amount: item.outstanding })),
    ...(summary.generalDue > 0 ? [{ key: 'general', label: t('parent.financial.generalInvoices'), icon: 'family_restroom', amount: summary.generalDue }] : []),
  ];

  return (
    <TableCard
      title={t('parent.dashboard.sectionFinancial')}
      actions={
        <>
          {summary.hasOverdue ? (
            <StatusPill tone="error" icon="warning">{t('parent.financial.overdueAlert')}</StatusPill>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to={`/parent/invoices${qs}`}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>receipt_long</span>
              {t('parent.financial.viewHistory')}
            </Link>
          </Button>
          {summary.totalOutstanding > 0 ? (
            <Button asChild size="sm">
              <Link to={`/parent/invoices${qs ? `${qs}&status=pending` : '?status=pending'}`}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>payments</span>
                {t('parent.financial.payNow')}
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile
            icon="account_balance_wallet"
            label={t('parent.dashboard.stats.outstanding')}
            value={money(summary.totalOutstanding)}
            tone={summary.hasOverdue ? 'error' : summary.totalOutstanding > 0 ? 'warning' : 'success'}
            to={`/parent/invoices${qs ? `${qs}&status=pending` : '?status=pending'}`}
          />
          <StatTile
            icon="event_upcoming"
            label={t('parent.invoices.nextDue')}
            value={summary.nextDue ? formatDate(summary.nextDue.dueDate) : '—'}
            helper={summary.nextDue ? money(summary.nextDue.amount) : t('parent.financial.noUpcoming')}
            tone={summary.nextDue ? 'primary' : 'neutral'}
          />
        </div>
        {breakdown.length ? (
          <div className="overflow-hidden rounded-lg border border-outline-variant">
            <p className="border-b border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs font-semibold text-on-surface-variant">
              {t('parent.financial.breakdownTitle')}
            </p>
            <ul className="divide-y divide-outline-variant">
              {breakdown.map((item) => (
                <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="material-symbols-outlined text-lg text-on-surface-variant" aria-hidden>{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-on-surface">{item.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-error">{money(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 self-center rounded-lg border border-success/30 bg-success/5 px-3 py-3 text-sm text-on-surface">
            <span className="material-symbols-outlined text-lg text-success" aria-hidden>task_alt</span>
            {summary.totalOutstanding > 0 ? t('parent.financial.noBreakdown') : t('parent.financial.allPaid')}
          </p>
        )}
      </div>
    </TableCard>
  );
}
