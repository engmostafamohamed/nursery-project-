import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceActionsMenu } from '@/features/parent-billing/InvoiceActionsMenu';
import { InvoiceStatusBadge } from '@/features/parent-billing/InvoiceStatusBadge';
import { invoiceState, isPayable, localName } from '@/features/parent-billing/parentBilling';
import { useParentInvoice } from '@/features/parent-billing/useParentBilling';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { parseInvoiceLineItems } from '@/lib/invoiceItems';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * One invoice: what it is for and its state at the top with the pay button, the money in one line
 * (amount, paid, waiting for the nursery, left to pay), then its lines, payments and reminders.
 * Print, share and download sit in the "⋯" menu.
 */
export function ParentInvoiceDetailsPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { invoiceId } = useParams();
  const query = useParentInvoice(invoiceId);
  const invoice = query.data;
  const printableRef = useRef<HTMLElement | null>(null);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (!invoice) {
    return <EmptyState icon="receipt_long" title={t('invoice.details.notFound')} description={t('parentBilling.notFoundHint')} />;
  }

  const state = invoiceState(invoice);
  const { items, notes, tax } = parseInvoiceLineItems(invoice.lineItems, i18n.language);
  const figures: Array<{ key: string; label: string; value: number; tone?: string }> = [
    { key: 'amount', label: t('parentBilling.details.amount'), value: invoice.amount },
    { key: 'paid', label: t('parentBilling.details.paid'), value: invoice.paidAmount, tone: 'text-success' },
    ...(invoice.pendingAmount > 0 ? [{ key: 'review', label: t('parentBilling.details.inReview'), value: invoice.pendingAmount, tone: 'text-warning' }] : []),
    // What can still be paid now, as on the pay button: what waits for the nursery is not counted twice.
    { key: 'left', label: t('parentBilling.details.left'), value: invoice.payable },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-28">
      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">{t(`invoice.types.${invoice.type}`)}</p>
            <h1 className="truncate text-2xl font-bold text-on-surface">{invoice.invoiceNumber}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
              <InvoiceStatusBadge state={state} />
              <span>{t('parentBilling.list.dueOn', { date: formatDate(invoice.dueDate) })}</span>
              {state === 'overdue' ? <span className="font-medium text-error">{t('parentBilling.list.lateDays', { count: invoice.overdueDays })}</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InvoiceActionsMenu invoice={invoice} printable={() => printableRef.current} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-outline-variant bg-outline-variant sm:grid-cols-4">
          {figures.map((f) => (
            <div key={f.key} className="bg-surface px-3 py-2">
              <dt className="text-xs text-on-surface-variant">{f.label}</dt>
              <dd className={cn('text-base font-bold tabular-nums text-on-surface', f.tone)}>{money(f.value)}</dd>
            </div>
          ))}
        </dl>

        {isPayable(invoice) ? (
          <Button asChild size="lg" className="mt-4 w-full gap-2 sm:w-auto">
            <Link to={`/parent/invoices/${invoice.id}/pay`}>
              <MaterialSymbol name="payments" size="text-lg" />
              {t('parentBilling.details.pay', { amount: money(invoice.payable) })}
            </Link>
          </Button>
        ) : null}

        {invoice.inReview.length ? (
          <div role="note" className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-warning">
              <MaterialSymbol name="hourglass_top" size="text-base" />
              {t('parentBilling.details.reviewTitle')}
            </p>
            <ul className="mt-1 space-y-0.5 text-on-surface">
              {invoice.inReview.map((p) => (
                <li key={p.id}>{t('parentBilling.pay.alreadySentLine', { amount: money(p.amount), date: formatDateTime(p.at) })}</li>
              ))}
            </ul>
            <p className="mt-1 text-on-surface-variant">{t('parentBilling.details.reviewHint')}</p>
          </div>
        ) : null}
      </section>

      <article ref={printableRef} className="invoice-print-area overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="border-b border-outline-variant bg-surface-container-lowest px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-on-surface">{t('parentBilling.details.lines')}</h2>
          {invoice.children.length ? (
            <p className="text-xs text-on-surface-variant">
              {invoice.children.map((c) => localName(c, isArabic)).join('، ')}
            </p>
          ) : null}
        </div>
        <ul className="divide-y divide-outline-variant">
          {items.map((item, index) => (
            <li key={`${index}-${item.description}`} className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
              <span className="min-w-0 text-on-surface">
                {item.description}
                {item.quantity !== 1 ? <span className="text-on-surface-variant"> × {item.quantity}</span> : null}
              </span>
              <span className={cn('shrink-0 font-semibold tabular-nums', item.total < 0 ? 'text-success' : 'text-on-surface')}>
                {money(item.total)}
              </span>
            </li>
          ))}
          {tax ? (
            <li className="flex justify-between gap-3 px-4 py-3 text-sm sm:px-5">
              <span className="text-on-surface-variant">{t('invoice.details.tax')}</span>
              <span className="font-semibold tabular-nums">{money(tax)}</span>
            </li>
          ) : null}
          <li className="flex justify-between gap-3 bg-surface-container-lowest px-4 py-3 text-sm sm:px-5">
            <span className="font-semibold text-on-surface">{t('invoice.details.total')}</span>
            <span className="font-bold tabular-nums text-on-surface">{money(invoice.amount)}</span>
          </li>
        </ul>
        {notes ? <p className="border-t border-outline-variant px-4 py-3 text-sm text-on-surface-variant sm:px-5">{notes}</p> : null}
      </article>

      <section className="rounded-xl border border-outline-variant bg-surface shadow-sm">
        <h2 className="border-b border-outline-variant px-4 py-3 text-base font-semibold text-on-surface sm:px-5">
          {t('parentBilling.details.history')}
        </h2>
        {invoice.payments.length || invoice.reminders.length ? (
          <ul className="divide-y divide-outline-variant">
            {[
              ...invoice.payments.map((p) => ({
                key: `p-${p.id}`,
                at: p.at,
                icon: 'check_circle',
                tone: 'text-success',
                text: t('parentBilling.details.paymentLine', {
                  amount: money(p.amount),
                  method: t(`payment.manualMethods.${p.method}.label`, { defaultValue: p.method }),
                }),
              })),
              ...invoice.reminders.map((r, i) => ({ key: `r-${i}`, at: r.sentAt, icon: 'notifications', tone: 'text-on-surface-variant', text: t('parentBilling.details.reminderLine') })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((row) => (
                <li key={row.key} className="flex items-start gap-3 px-4 py-3 text-sm sm:px-5">
                  <MaterialSymbol name={row.icon} size="text-lg" className={row.tone} />
                  <span className="min-w-0 flex-1 text-on-surface">{row.text}</span>
                  <span className="shrink-0 text-xs text-on-surface-variant">{formatDateTime(row.at)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-on-surface-variant sm:px-5">{t('parentBilling.details.noHistory')}</p>
        )}
      </section>
    </div>
  );
}
