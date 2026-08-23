import { CalendarClock, CircleDollarSign, Clock3, ReceiptText } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ParentInvoiceItem } from '@/hooks/useParentInvoices';
import { formatDate } from '@/lib/datetime';

interface Props {
  invoice: ParentInvoiceItem;
  onPayNow: () => void;
  onView: () => void;
  highlighted?: boolean;
  submitting?: boolean;
}

function typeIcon(type: ParentInvoiceItem['type']) {
  if (type === 'monthly') return <CalendarClock className="h-4 w-4" />;
  if (type === 'event') return <ReceiptText className="h-4 w-4" />;
  if (type === 'extra_hours') return <Clock3 className="h-4 w-4" />;
  return <CircleDollarSign className="h-4 w-4" />;
}

export function InvoiceCard({ invoice, onPayNow, onView, highlighted, submitting }: Props) {
  const { t } = useTranslation();
  const nowMs = useMemo(() => Date.now(), []);
  const dueDate = new Date(invoice.dueDate);
  const countdown = Math.ceil((dueDate.getTime() - nowMs) / 86400000);
  const showCountdown = invoice.status === 'pending' && countdown >= 0;

  return (
    <article
      id={`invoice-card-${invoice.id}`}
      className={`space-y-3 rounded-2xl border bg-surface-container-lowest p-4 ${
        highlighted ? 'border-primary ring-2 ring-primary/40' : 'border-outline-variant'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-xs text-on-surface-variant">
          {typeIcon(invoice.type)}
          {t(`invoice.types.${invoice.type}`)}
        </p>
        <span
          className={`rounded-full px-2 py-1 text-xs ${
            invoice.inReview
              ? 'bg-primary/10 text-primary'
              : invoice.status === 'overdue'
                ? 'bg-error-container text-on-error-container'
                : invoice.status === 'paid'
                  ? 'bg-success/10 text-success'
                  : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          {invoice.inReview ? t('invoice.inReview') : t(`invoice.status.${invoice.status}`)}
        </span>
      </div>
      <p className="text-lg font-extrabold text-on-surface">{t('invoice.egpAmount', { amount: invoice.amount.toFixed(2) })}</p>
      <p className="text-sm text-on-surface-variant">{invoice.description || t('invoice.noDescription')}</p>
      <div className="text-xs text-on-surface-variant">
        <p>{t('invoice.invoiceNumber', { number: invoice.invoiceNumber })}</p>
        <p>{t('invoice.dueDate', { date: formatDate(dueDate) })}</p>
        {showCountdown ? <p>{t('invoice.countdown', { days: countdown })}</p> : null}
        {invoice.status === 'overdue' ? <p>{t('invoice.overdueDays', { days: invoice.overdueDays })}</p> : null}
      </div>
      {invoice.inReview ? (
        <p className="rounded-lg bg-primary/5 px-2 py-1 text-xs text-primary">{t('invoice.inReviewNote')}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!invoice.inReview && (invoice.status === 'pending' || invoice.status === 'overdue') ? (
          <Button size="sm" onClick={onPayNow} disabled={submitting}>
            {submitting ? t('payment.submitting') : t('invoice.actions.payNow')}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onView}>
          {t('invoice.actions.viewDetails')}
        </Button>
      </div>
    </article>
  );
}
