import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { StatusPill, type PillTone } from '@/components/ui/DataTable';
import { TONE_TINT } from '@/components/ui/toneClasses';
import type { ParentInvoiceItem } from '@/hooks/useParentInvoices';
import { activeLocale, formatDate } from '@/lib/datetime';
import { invoiceTypeIcon } from '@/lib/invoiceDisplay';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

interface Props {
  invoice: ParentInvoiceItem;
  onPayNow: () => void;
  onView: () => void;
  highlighted?: boolean;
  submitting?: boolean;
  /** Names of the children the invoice covers; shown when the family has more than one child. */
  childNames?: string[];
}

function invoiceStatusUi(invoice: ParentInvoiceItem): { tone: PillTone; icon: string } {
  if (invoice.inReview) return { tone: 'primary', icon: 'hourglass_top' };
  if (invoice.status === 'overdue') return { tone: 'error', icon: 'error' };
  if (invoice.status === 'paid') return { tone: 'success', icon: 'task_alt' };
  if (invoice.status === 'cancelled') return { tone: 'neutral', icon: 'block' };
  return { tone: 'warning', icon: 'schedule' };
}

export function InvoiceCard({ invoice, onPayNow, onView, highlighted, submitting, childNames = [] }: Props) {
  const { t } = useTranslation();
  const [nowMs] = useState(() => Date.now());
  const dueDate = new Date(invoice.dueDate);
  const countdown = Math.ceil((dueDate.getTime() - nowMs) / 86400000);
  const showCountdown = invoice.status === 'pending' && countdown >= 0;
  const { tone, icon } = invoiceStatusUi(invoice);
  const canPay = !invoice.inReview && (invoice.status === 'pending' || invoice.status === 'overdue');
  const partlyPaid = invoice.paidAmount > 0 && invoice.balance > 0;
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

  return (
    <article
      id={`invoice-card-${invoice.id}`}
      className={cn(
        'flex gap-4 rounded-xl border bg-surface p-4 shadow-sm transition hover:shadow-md',
        highlighted ? 'border-primary ring-2 ring-primary/40' : invoice.status === 'overdue' && !invoice.inReview ? 'border-error/40' : 'border-outline-variant',
      )}
    >
      <div className={cn('flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg', TONE_TINT[tone])}>
        <span className="text-[11px] font-semibold uppercase">{dueDate.toLocaleDateString(activeLocale(), { month: 'short' })}</span>
        <span className="text-2xl font-bold leading-none tabular-nums">{dueDate.toLocaleDateString(activeLocale(), { day: 'numeric' })}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden>{invoiceTypeIcon(invoice.type)}</span>
              {t(`invoice.types.${invoice.type}`)}
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">{t('invoice.invoiceNumber', { number: invoice.invoiceNumber })}</p>
          </div>
          <StatusPill tone={tone} icon={icon}>
            {invoice.inReview ? t('invoice.inReview') : t(`invoice.status.${invoice.status}`)}
          </StatusPill>
        </div>

        <div>
          <p className="text-2xl font-bold tabular-nums text-on-surface">{money(invoice.amount)}</p>
          {partlyPaid ? (
            <p className="mt-0.5 text-xs font-medium text-warning">{t('parent.invoices.remaining', { amount: money(invoice.balance) })}</p>
          ) : null}
          {invoice.description ? <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{invoice.description}</p> : null}
        </div>

        <div className="space-y-1 text-xs text-on-surface-variant">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-sm" aria-hidden>event</span>
              {t('invoice.dueDate', { date: formatDate(dueDate) })}
            </span>
            {showCountdown ? <span className="font-semibold text-warning">{t('invoice.countdown', { days: countdown })}</span> : null}
            {invoice.status === 'overdue' ? (
              <span className="font-semibold text-error">{t('invoice.overdueDays', { days: invoice.overdueDays })}</span>
            ) : null}
          </p>
          {childNames.length ? (
            <p className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm" aria-hidden>child_care</span>
              {childNames.join(', ')}
            </p>
          ) : null}
        </div>

        {invoice.inReview ? (
          <p className="flex items-start gap-2 rounded-lg border-s-4 border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
            <span className="material-symbols-outlined text-sm" aria-hidden>info</span>
            {t('invoice.inReviewNote')}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant pt-3">
          <Button variant="ghost" size="sm" onClick={onView}>
            {t('invoice.actions.viewDetails')}
            <span className="material-symbols-outlined ms-1 text-base rtl:rotate-180" aria-hidden>chevron_right</span>
          </Button>
          {canPay ? (
            <Button size="sm" onClick={onPayNow} disabled={submitting}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>payments</span>
              {submitting ? t('payment.submitting') : t('invoice.actions.payNow')}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
