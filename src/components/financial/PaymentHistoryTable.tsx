import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { DataTable, StatusPill, TBody, Td, Th, THead, TableCard, TableEmpty, TableLoading, TablePagination, Tr } from '@/components/ui/DataTable';
import { usePagination } from '@/hooks/usePagination';
import type { PaymentHistoryRow } from '@/hooks/usePaymentHistory';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { invoiceTypeIcon, paidShare, paymentStateUi } from '@/lib/invoiceDisplay';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type PaymentHistoryTableProps = {
  rows: PaymentHistoryRow[];
  isLoading?: boolean;
  title?: string;
  emptyTitle?: string;
  showParent?: boolean;
  /** Fewer columns (no due date, gateway or reference) and five rows a page, for dashboards. */
  compact?: boolean;
  linkBase?: '/admin/invoices' | '/parent/invoices';
  /** Buttons or links on the title strip, e.g. "View all". */
  actions?: ReactNode;
  className?: string;
};

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * Invoices with what was paid, what is pending review and what is still owed. Each row keeps all
 * its data on one line; clicking it opens the invoice for the full details.
 */
export function PaymentHistoryTable({
  rows,
  isLoading = false,
  title,
  emptyTitle,
  showParent = true,
  compact = false,
  linkBase = '/admin/invoices',
  actions,
  className,
}: PaymentHistoryTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageSize = compact ? 5 : 10;
  const pager = usePagination(rows, pageSize, rows.length);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const when = (value: string | null) => (value ? formatDateTime(value, DATE_TIME) : '—');
  const status = (row: PaymentHistoryRow) => {
    const ui = paymentStateUi(row.status);
    return (
      <StatusPill tone={ui.tone} icon={ui.icon}>
        {t(ui.labelKey, { defaultValue: row.status })}
      </StatusPill>
    );
  };
  const method = (row: PaymentHistoryRow) =>
    row.paymentMethod ? t(`payment.methods.${row.paymentMethod}`, { defaultValue: row.paymentMethod }) : '—';

  return (
    <TableCard
      title={title ?? t('financial.paymentHistory.reportTitle')}
      count={rows.length ? t('financial.paymentHistory.count', { count: rows.length }) : undefined}
      actions={actions}
      className={className}
      pagination={rows.length > pageSize ? <TablePagination pager={pager} pageSizeOptions={compact ? [5, 10, 20] : [10, 25, 50]} /> : null}
    >
      {isLoading ? (
        <TableLoading rows={compact ? 3 : 5} />
      ) : rows.length === 0 ? (
        <TableEmpty
          icon="payments"
          title={emptyTitle ?? t('financial.paymentHistory.emptyTitle')}
          description={t('financial.paymentHistory.emptyDescription')}
        />
      ) : (
        <>
          {/* Phones: one card per invoice, the whole card opens it. */}
          <ul className="divide-y divide-outline-variant md:hidden">
            {pager.pageItems.map((row) => (
              <li key={row.id}>
                <Link to={`${linkBase}/${row.invoiceId}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-container-lowest">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
                    <span className="material-symbols-outlined text-xl">{invoiceTypeIcon(row.invoiceType)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-primary">{row.invoiceNumber}</span>
                        <span className="block truncate text-xs text-on-surface-variant">{row.description || t(`invoice.types.${row.invoiceType}`)}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-on-surface">{money(row.amount)}</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      {status(row)}
                      <span className="text-xs text-on-surface-variant">{when(row.paidAt ?? row.lastAttemptAt ?? row.createdAt)}</span>
                    </span>
                  </span>
                  <span className="material-symbols-outlined shrink-0 self-center text-on-surface-variant rtl:rotate-180" aria-hidden>chevron_right</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablets and up: the table; a row opens the invoice. */}
          <div className="hidden md:block">
            <DataTable minWidth={compact ? 880 : 1180}>
              <THead>
                <Th>{t('invoice.table.invoiceNo')}</Th>
                {showParent ? <Th>{t('invoice.table.parent')}</Th> : null}
                <Th>{t('invoice.table.type')}</Th>
                <Th>{t('invoice.table.amount')}</Th>
                <Th>{t('financial.paymentHistory.paidBalance')}</Th>
                <Th>{t('invoice.table.status')}</Th>
                {!compact ? <Th>{t('financial.paymentHistory.createdAt')}</Th> : null}
                {!compact ? <Th>{t('invoice.table.dueDate')}</Th> : null}
                <Th>{t('financial.paymentHistory.paidOrSubmittedAt')}</Th>
                <Th>{t('admin.financialDashboard.table.method')}</Th>
                {!compact ? <Th>{t('financial.paymentHistory.gateway')}</Th> : null}
                {!compact ? <Th>{t('financial.paymentHistory.reference')}</Th> : null}
              </THead>
              <TBody>
                {pager.pageItems.map((row) => (
                  <Tr key={row.id} onClick={() => navigate(`${linkBase}/${row.invoiceId}`)} className="whitespace-nowrap">
                    <Td>
                      <Link to={`${linkBase}/${row.invoiceId}`} className="block text-sm font-semibold text-primary hover:underline">
                        {row.invoiceNumber}
                      </Link>
                      {row.description ? (
                        <span className="block max-w-[11rem] truncate text-xs text-on-surface-variant" title={row.description}>
                          {row.description}
                        </span>
                      ) : null}
                    </Td>
                    {showParent ? <Td className="text-sm text-on-surface">{row.parentName}</Td> : null}
                    <Td className="text-sm text-on-surface">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base text-primary" aria-hidden>{invoiceTypeIcon(row.invoiceType)}</span>
                        {t(`invoice.types.${row.invoiceType}`)}
                      </span>
                    </Td>
                    <Td className="text-sm font-semibold tabular-nums text-on-surface">{money(row.amount)}</Td>
                    <Td>
                      <div className="w-32">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="font-semibold tabular-nums text-success">{money(row.paidAmount)}</span>
                          <span className="tabular-nums text-on-surface-variant">{paidShare(row.paidAmount, row.amount)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-high">
                          <div className="h-full rounded-full bg-success" style={{ width: `${paidShare(row.paidAmount, row.amount)}%` }} />
                        </div>
                        <p className={cn('mt-1 text-[11px] tabular-nums', row.balanceDue > 0 ? 'font-medium text-error' : 'text-on-surface-variant')}>
                          {row.pendingAmount > 0
                            ? t('financial.paymentHistory.pending', { amount: money(row.pendingAmount) })
                            : t('financial.paymentHistory.balance', { amount: money(row.balanceDue) })}
                        </p>
                      </div>
                    </Td>
                    <Td>{status(row)}</Td>
                    {!compact ? <Td className="text-sm text-on-surface-variant">{when(row.createdAt)}</Td> : null}
                    {!compact ? <Td className="text-sm text-on-surface-variant">{row.dueDate ? formatDate(row.dueDate) : '—'}</Td> : null}
                    <Td className="text-sm text-on-surface-variant">{when(row.paidAt ?? row.lastAttemptAt)}</Td>
                    <Td className="min-w-[7rem] max-w-[9rem] whitespace-normal text-sm leading-5 text-on-surface">{method(row)}</Td>
                    {!compact ? <Td className="text-sm text-on-surface-variant">{row.gateway || '—'}</Td> : null}
                    {!compact ? (
                      <Td className="max-w-[10rem] truncate text-xs text-on-surface-variant">
                        <span dir="ltr">{row.gatewayRef ?? '—'}</span>
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          </div>
        </>
      )}
    </TableCard>
  );
}
