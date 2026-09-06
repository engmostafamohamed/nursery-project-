import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { PaymentHistoryRow, PaymentHistoryStatus } from '@/hooks/usePaymentHistory';
import { cn } from '@/lib/utils';

type PaymentHistoryTableProps = {
  rows: PaymentHistoryRow[];
  isLoading?: boolean;
  title?: string;
  emptyTitle?: string;
  showParent?: boolean;
  compact?: boolean;
  linkBase?: '/admin/invoices' | '/parent/invoices';
  className?: string;
};

const statusVariant: Record<PaymentHistoryStatus, ComponentProps<typeof Badge>['variant']> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'secondary',
  in_review: 'warning',
  overdue: 'error',
  cancelled: 'outline',
};

function displayDateTime(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '-';
}

function statusLabelKey(status: PaymentHistoryRow['status']): string {
  if (status === 'in_review') return 'invoice.inReview';
  if (status === 'partial') return 'financial.paymentHistory.partial';
  if (status === 'unpaid') return 'invoice.status.pending';
  return `invoice.status.${status}`;
}

export function PaymentHistoryTable({
  rows,
  isLoading = false,
  title,
  emptyTitle,
  showParent = true,
  compact = false,
  linkBase = '/admin/invoices',
  className,
}: PaymentHistoryTableProps) {
  const { t } = useTranslation();

  return (
    <section className={cn('rounded-2xl border border-outline-variant bg-surface-container-lowest p-4', className)}>
      {title ? <h3 className="mb-3 text-sm font-semibold text-on-surface">{title}</h3> : null}
      {isLoading ? (
        <p className="text-sm text-on-surface-variant">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="payments"
          title={emptyTitle ?? t('financial.paymentHistory.emptyTitle', { defaultValue: 'No payment history yet' })}
          description={t('financial.paymentHistory.emptyDescription', {
            defaultValue: 'Paid and unpaid invoice activity will appear here.',
          })}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="px-2 py-2 text-start">{t('invoice.table.invoiceNo')}</th>
                {showParent ? (
                  <th className="px-2 py-2 text-start">{t('invoice.table.parent')}</th>
                ) : null}
                <th className="px-2 py-2 text-start">{t('invoice.table.type')}</th>
                <th className="px-2 py-2 text-start">{t('invoice.table.amount')}</th>
                <th className="px-2 py-2 text-start">
                  {t('financial.paymentHistory.paidBalance', { defaultValue: 'Paid / balance' })}
                </th>
                <th className="px-2 py-2 text-start">{t('invoice.table.status')}</th>
                <th className="px-2 py-2 text-start">
                  {t('financial.paymentHistory.createdAt', { defaultValue: 'Created' })}
                </th>
                {!compact ? (
                  <th className="px-2 py-2 text-start">{t('invoice.table.dueDate')}</th>
                ) : null}
                <th className="px-2 py-2 text-start">
                  {t('financial.paymentHistory.paidOrSubmittedAt', { defaultValue: 'Paid / submitted' })}
                </th>
                <th className="px-2 py-2 text-start">{t('admin.financialDashboard.table.method')}</th>
                {!compact ? (
                  <th className="px-2 py-2 text-start">
                    {t('financial.paymentHistory.gateway', { defaultValue: 'Gateway' })}
                  </th>
                ) : null}
                {!compact ? (
                  <th className="px-2 py-2 text-start">
                    {t('financial.paymentHistory.reference', { defaultValue: 'Reference' })}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-outline-variant align-top">
                  <td className="px-2 py-2">
                    <Button asChild variant="ghost" className="h-auto min-h-0 px-0 py-0 text-sm text-primary">
                      <Link to={`${linkBase}/${row.invoiceId}`}>{row.invoiceNumber}</Link>
                    </Button>
                    {row.description ? (
                      <span className="mt-0.5 block max-w-[220px] truncate text-xs text-on-surface-variant">
                        {row.description}
                      </span>
                    ) : null}
                  </td>
                  {showParent ? <td className="px-2 py-2">{row.parentName}</td> : null}
                  <td className="px-2 py-2">{t(`invoice.types.${row.invoiceType}`)}</td>
                  <td className="px-2 py-2">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</td>
                  <td className="px-2 py-2">
                    <span className="block font-medium text-success">{t('invoice.egpAmount', { amount: row.paidAmount.toFixed(2) })}</span>
                    {row.pendingAmount > 0 ? (
                      <span className="block text-xs text-warning">
                        {t('financial.paymentHistory.pending', {
                          amount: row.pendingAmount.toFixed(2),
                          defaultValue: 'Pending {{amount}}',
                        })}
                      </span>
                    ) : null}
                    <span className="block text-xs text-on-surface-variant">
                      {t('financial.paymentHistory.balance', {
                        amount: row.balanceDue.toFixed(2),
                        defaultValue: 'Balance {{amount}}',
                      })}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <Badge variant={statusVariant[row.status]}>
                      {t(statusLabelKey(row.status), { defaultValue: row.status })}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">{displayDateTime(row.createdAt)}</td>
                  {!compact ? <td className="px-2 py-2">{displayDateTime(row.dueDate)}</td> : null}
                  <td className="px-2 py-2">{displayDateTime(row.paidAt ?? row.lastAttemptAt)}</td>
                  <td className="px-2 py-2">
                    {row.paymentMethod
                      ? t(`payment.methods.${row.paymentMethod}`, { defaultValue: row.paymentMethod })
                      : '-'}
                  </td>
                  {!compact ? <td className="px-2 py-2">{row.gateway}</td> : null}
                  {!compact ? <td className="px-2 py-2">{row.gatewayRef ?? '-'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
