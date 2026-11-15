import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Td, Tr } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDate } from '@/lib/datetime';
import { invoiceTypeIcon } from '@/lib/invoiceDisplay';
import { invoiceItemDescription, invoiceRawItems } from '@/lib/invoiceItems';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { invoiceState, isPayable, type BillingInvoice } from './parentBilling';

/**
 * One invoice in the family's invoices table: what it is for, its number, its state, the amount and
 * a pay button. The row opens the invoice.
 */
export function InvoiceRow({
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
    <Tr id={`invoice-card-${invoice.id}`} onClick={onOpen} className={cn(highlighted && 'bg-primary/5 ring-2 ring-inset ring-primary')} data-testid="invoice-item">
      <Td className="min-w-[14rem]">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MaterialSymbol name={invoiceTypeIcon(invoice.type)} size="text-lg" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-on-surface">{t(`invoice.types.${invoice.type}`)} · {month}</span>
            <span className="block truncate text-xs text-on-surface-variant">
              {[description, childNames.join(t('parentBilling.list.namesJoin'))].filter(Boolean).join(' · ') || '—'}
            </span>
          </span>
        </span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">
        <span dir="ltr">{invoice.invoiceNumber}</span>
      </Td>
      <Td>
        <InvoiceStatusBadge state={state} />
        {state === 'overdue' ? (
          <span className="mt-1 block text-xs font-medium text-error">{t('parentBilling.list.lateDays', { count: invoice.overdueDays })}</span>
        ) : state === 'due' ? (
          <span className="mt-1 block text-xs text-on-surface-variant">{t('parentBilling.list.dueOn', { date: formatDate(invoice.dueDate) })}</span>
        ) : null}
      </Td>
      <Td align="end" className="whitespace-nowrap">
        <span className="block font-bold tabular-nums text-on-surface">{money(shownAmount)}</span>
        {payable && invoice.pendingAmount > 0 ? (
          <span className="block text-xs text-warning">{t('parentBilling.list.partInReview', { amount: money(invoice.pendingAmount) })}</span>
        ) : null}
      </Td>
      <Td align="end">
        {payable ? (
          <Button type="button" size="sm" onClick={onPay}>
            {t('parentBilling.list.pay')}
          </Button>
        ) : (
          <MaterialSymbol name="chevron_right" size="text-xl" className="text-primary rtl:rotate-180" />
        )}
      </Td>
    </Tr>
  );
}
