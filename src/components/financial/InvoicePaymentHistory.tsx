import { useTranslation } from 'react-i18next';

import { DataTable, StatusPill, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/lib/datetime';
import type { InvoicePaymentItem } from '@/hooks/useInvoiceDetails';

type Props = {
  payments: InvoicePaymentItem[];
};

const STATUS_TONE: Record<string, PillTone> = { completed: 'success', pending: 'warning', failed: 'error', refunded: 'neutral' };

/** What was paid on this invoice, as a table with a pager: amount, how, when, the reference and the state of each payment. */
export function InvoicePaymentHistory({ payments }: Props) {
  const { t } = useTranslation();
  const pager = usePagination(payments, 10, payments.length);

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-lg" aria-hidden>payments</span>
        </span>
        <h2 className="text-base font-semibold text-on-surface">{t('invoice.details.paymentHistory.title')}</h2>
      </div>
      {payments.length ? (
        <>
          <DataTable minWidth={680}>
            <THead>
              <Th align="end">{t('invoice.details.paymentHistory.table.amount')}</Th>
              <Th>{t('invoice.details.paymentHistory.method')}</Th>
              <Th>{t('invoice.details.paymentHistory.paidAt')}</Th>
              <Th>{t('invoice.details.paymentHistory.reference')}</Th>
              <Th>{t('invoice.details.paymentHistory.table.status')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((payment) => (
                <Tr key={payment.id} data-testid="invoice-payment-row">
                  <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">
                    {t('invoice.egpAmount', { amount: payment.amount.toFixed(2) })}
                  </Td>
                  <Td className="text-on-surface">{t(`invoice.paymentMethods.${payment.method}`, { defaultValue: payment.method })}</Td>
                  <Td className="whitespace-nowrap text-on-surface-variant">{formatDateTime(payment.paidAt || payment.createdAt)}</Td>
                  <Td className="max-w-[14rem] break-all text-xs text-on-surface-variant">{payment.reference || '—'}</Td>
                  <Td>
                    <StatusPill tone={STATUS_TONE[payment.status] ?? 'neutral'}>{t(`invoice.details.paymentHistory.status.${payment.status}`)}</StatusPill>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </>
      ) : (
        <p className="p-4 text-sm text-on-surface-variant">{t('invoice.details.paymentHistory.empty')}</p>
      )}
    </section>
  );
}
