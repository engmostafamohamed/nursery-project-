import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDate } from '@/lib/datetime';
import { invoiceItemDescription, invoiceRawItems } from '@/lib/invoiceItems';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { invoiceState, isPayable, type BillingInvoice } from './parentBilling';

const TYPE_ICON: Record<BillingInvoice['type'], string> = {
  monthly: 'calendar_month',
  event: 'celebration',
  extra_hours: 'more_time',
  other: 'receipt_long',
};

/**
 * One invoice in the parent's list, kept short: what it is for, the amount, its state and a pay
 * button. The whole card opens the invoice.
 */
export function InvoiceListItem({
  invoice,
  childNames = [],
  highlighted = false,
  onOpen,
  onPay,
}: {
  invoice: BillingInvoice;
  /** Shown when the family has more than one child. */
  childNames?: string[];
  highlighted?: boolean;
  onOpen: () => void;
  onPay: () => void;
}) {
  const { t, i18n } = useTranslation();
  const state = invoiceState(invoice);
  const payable = isPayable(invoice);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const firstLine = invoiceRawItems(invoice.lineItems)[0];
  const description = firstLine ? invoiceItemDescription(firstLine, i18n.language) : '';
  const month = formatDate(invoice.dueDate, { month: 'long', year: 'numeric' });
  // An open invoice shows what is left to send; a closed one, its amount.
  const shownAmount = payable ? invoice.payable : invoice.amount;

  return (
    <article
      id={`invoice-card-${invoice.id}`}
      data-testid="invoice-item"
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-surface p-3 transition-colors sm:p-4',
        state === 'overdue' ? 'border-error/40' : 'border-outline-variant',
        highlighted && 'ring-2 ring-primary',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={t('parentBilling.list.openInvoice', { number: invoice.invoiceNumber })}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MaterialSymbol name={TYPE_ICON[invoice.type]} size="text-xl" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-on-surface">
            {t(`invoice.types.${invoice.type}`)} · {month}
          </span>
          <span className="block truncate text-xs text-on-surface-variant">
            {[description, childNames.join('، ')].filter(Boolean).join(' · ') || invoice.invoiceNumber}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <InvoiceStatusBadge state={state} />
            {state === 'overdue' ? (
              <span className="text-xs font-medium text-error">{t('parentBilling.list.lateDays', { count: invoice.overdueDays })}</span>
            ) : state === 'due' ? (
              <span className="text-xs text-on-surface-variant">{t('parentBilling.list.dueOn', { date: formatDate(invoice.dueDate) })}</span>
            ) : null}
          </span>
        </span>
        <span className="shrink-0 text-end">
          <span className="block text-base font-bold tabular-nums text-on-surface">{money(shownAmount)}</span>
          {payable && invoice.pendingAmount > 0 ? (
            <span className="block text-xs text-warning">{t('parentBilling.list.partInReview', { amount: money(invoice.pendingAmount) })}</span>
          ) : null}
        </span>
      </button>
      {payable ? (
        <Button type="button" size="sm" className="shrink-0" onClick={onPay}>
          {t('parentBilling.list.pay')}
        </Button>
      ) : null}
    </article>
  );
}
