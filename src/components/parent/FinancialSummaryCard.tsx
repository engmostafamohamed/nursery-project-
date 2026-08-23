import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { useParentChildren, type ChildOption } from '@/components/parent/ChildSelector';
import { formatDate } from '@/lib/datetime';

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
  const children = childrenQuery.data ?? [];

  const getName = (c: ChildOption) =>
    i18n.language === 'ar' ? (c.nameAr || c.nameEn) : (c.nameEn || c.nameAr);

  const summary = useMemo(() => {
    const rows = invoices.allData ?? [];
    const dueRows = rows.filter((r) => r.status === 'pending' || r.status === 'overdue');
    const totalOutstanding = dueRows.reduce((s, r) => s + r.amount, 0);
    const nextDue = [...dueRows].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
    const hasOverdue = dueRows.some((r) => r.status === 'overdue');

    const perChild: ChildBreakdown[] = [];
    let generalDue = 0;
    if (children.length > 1) {
      for (const child of children) {
        const childDue = dueRows
          .filter((r) => r.childIds.includes(child.id))
          .reduce((s, r) => s + r.amount / Math.max(r.childIds.length, 1), 0);
        if (childDue > 0) {
          perChild.push({ child, outstanding: childDue });
        }
      }
      generalDue = dueRows
        .filter((r) => r.childIds.length === 0)
        .reduce((s, r) => s + r.amount, 0);
    }

    return { totalOutstanding, nextDue, hasOverdue, perChild, generalDue };
  }, [invoices.allData, children]);

  return (
    <section className="space-y-3 rounded-3xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      {summary.hasOverdue ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-[11px] font-medium text-on-error-container">
          <span className="material-symbols-outlined text-sm" aria-hidden>warning</span>
          {t('parent.financial.overdueAlert')}
        </span>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        {t('parent.financial.totalOutstanding', { amount: summary.totalOutstanding.toFixed(2) })}
      </p>
      {summary.perChild.length > 0 || summary.generalDue > 0 ? (
        <div className="space-y-1 border-t border-outline-variant pt-2">
          {summary.perChild.map((item) => (
            <p key={item.child.id} className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>{getName(item.child)}</span>
              <span className="font-medium">{t('invoice.egpAmount', { amount: item.outstanding.toFixed(2) })}</span>
            </p>
          ))}
          {summary.generalDue > 0 ? (
            <p className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>{t('parent.financial.generalInvoices')}</span>
              <span className="font-medium">{t('invoice.egpAmount', { amount: summary.generalDue.toFixed(2) })}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-sm text-on-surface-variant">
        {summary.nextDue
          ? t('parent.financial.nextDue', { date: formatDate(summary.nextDue.dueDate), amount: summary.nextDue.amount.toFixed(2) })
          : t('parent.financial.noUpcoming')}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/parent/invoices${qs}`}>{t('parent.financial.viewHistory')}</Link>
        </Button>
        {summary.hasOverdue ? (
          <Button asChild size="sm">
            <Link to={`/parent/invoices${qs ? `${qs}&status=pending` : '?status=pending'}`}>{t('parent.financial.payNow')}</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
