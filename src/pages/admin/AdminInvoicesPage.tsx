import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceActionsMenu } from '@/components/admin/InvoiceActionsMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useAdminInvoices,
  type AdminInvoiceItem,
  type AdminInvoiceSort,
  type AdminInvoiceStatusFilter,
  type AdminInvoiceTypeFilter,
} from '@/hooks/useAdminInvoices';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cancelInvoice, markInvoiceAsPaid } from '@/lib/invoiceActions';
import { cn } from '@/lib/utils';

function statusBadgeClass(status: AdminInvoiceItem['status']) {
  if (status === 'paid') return 'border-success/30 bg-success/10 text-success';
  if (status === 'overdue') return 'border-error/30 bg-error/10 text-error';
  if (status === 'cancelled') return 'border-outline-variant bg-surface-container text-on-surface-variant';
  return 'border-warning/30 bg-warning/10 text-warning';
}

function SummaryCard({
  icon,
  label,
  value,
  tone = 'primary',
}: {
  icon: string;
  label: string;
  value: ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'error';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', toneClass)}>
          <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-on-surface-variant">{label}</p>
          <p className="mt-1 break-words text-xl font-semibold text-on-surface">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function AdminInvoicesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  const [status, setStatus] = useState<AdminInvoiceStatusFilter>('all');
  const [type, setType] = useState<AdminInvoiceTypeFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<AdminInvoiceSort>('created_desc');
  const [dateField, setDateField] = useState<'created_at' | 'due_date'>('created_at');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const invoicesQuery = useAdminInvoices({
    nurseryId: profile?.nursery_id ?? undefined,
    search,
    status,
    type,
    sort,
    dateField,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });
  const invoices = invoicesQuery.data;

  const summary = useMemo(() => {
    const outstanding = invoices
      .filter((row) => row.status === 'pending' || row.status === 'overdue')
      .reduce((sum, row) => sum + row.amount, 0);
    const now = new Date();
    const paidThisMonth = invoices
      .filter((row) => row.status === 'paid' && row.paidAt && new Date(row.paidAt).getMonth() === now.getMonth())
      .reduce((sum, row) => sum + row.amount, 0);
    const overdueCount = invoices.filter((row) => row.status === 'overdue').length;
    const paidRows = invoices.filter((row) => row.status === 'paid' && row.paidAt);
    const avgDays = paidRows.length
      ? Math.round(
          paidRows.reduce((sum, row) => {
            const diff = +new Date(row.paidAt as string) - +new Date(row.createdAt);
            return sum + Math.max(0, diff / 86400000);
          }, 0) / paidRows.length,
        )
      : 0;
    return { outstanding, paidThisMonth, overdueCount, avgDays };
  }, [invoices]);

  const onMarkPaid = async (
    invoiceId: string,
    payload: { paymentMethod: string; paidAt: string; notes: string },
    parentId: string,
    invoiceNumber: string,
    amount: number,
  ) => {
    if (!profile?.nursery_id) return;
    await markInvoiceAsPaid({
      invoiceId,
      nurseryId: profile.nursery_id,
      parentId,
      invoiceNumber,
      amount,
      paymentMethod: payload.paymentMethod,
      paidAt: payload.paidAt,
    });
    toast.success(t('invoice.markPaid.success'));
    await invoicesQuery.refetch();
  };

  const onCancel = async (invoiceId: string) => {
    await cancelInvoice({ invoiceId });
    toast.success(t('invoice.cancel.success'));
    await invoicesQuery.refetch();
  };

  const renderInvoiceActions = (row: AdminInvoiceItem) => (
    <InvoiceActionsMenu
      disabled={row.status === 'paid' || row.status === 'cancelled'}
      onView={() => navigate(`/admin/invoices/${row.id}${qs}`)}
      onMarkPaid={(payload) => onMarkPaid(row.id, payload, row.parentId, row.invoiceNumber, row.amount)}
      onCancel={() => onCancel(row.id)}
    />
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">{t('admin.invoices.title')}</p>
            <h1 className="mt-1 text-3xl font-semibold text-on-surface">{t('admin.invoices.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
              {t('invoice.filters.search', { defaultValue: 'Search invoices, parents, and payments' })}
            </p>
          </div>
          <Button asChild className="h-11 gap-2 rounded-md">
            <Link to={`/admin/invoices/new${qs}`}>
              <span className="material-symbols-outlined text-lg" aria-hidden>add</span>
              {t('invoice.create.newInvoice')}
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-5">
          <SummaryCard
            icon="account_balance_wallet"
            label={t('invoice.summary.totalOutstanding')}
            value={t('invoice.egpAmount', { amount: summary.outstanding.toFixed(2) })}
            tone={summary.outstanding > 0 ? 'warning' : 'success'}
          />
          <SummaryCard
            icon="payments"
            label={t('invoice.summary.paidThisMonth')}
            value={t('invoice.egpAmount', { amount: summary.paidThisMonth.toFixed(2) })}
            tone="success"
          />
          <SummaryCard
            icon="priority_high"
            label={t('invoice.summary.overdueCount')}
            value={summary.overdueCount}
            tone={summary.overdueCount > 0 ? 'error' : 'success'}
          />
          <SummaryCard
            icon="timer"
            label={t('invoice.summary.avgDaysToPayment')}
            value={t('invoice.days', { count: summary.avgDays })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_160px_260px]">
          <Input
            className="h-11 rounded-md bg-surface-container-lowest"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('invoice.filters.search')}
          />
          <select
            className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            value={type}
            onChange={(e) => setType(e.target.value as AdminInvoiceTypeFilter)}
          >
            {(['all', 'monthly', 'event', 'extra_hours', 'other'] as const).map((value) => (
              <option key={value} value={value}>{t(`invoice.filters.types.${value}`)}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            value={sort}
            onChange={(e) => setSort(e.target.value as AdminInvoiceSort)}
          >
            {(['created_desc', 'created_asc', 'amount_desc', 'amount_asc', 'due_date_asc', 'due_date_desc'] as const).map((value) => (
              <option key={value} value={value}>{t(`invoice.filters.sort.${value}`)}</option>
            ))}
          </select>
          <select
            className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            value={dateField}
            onChange={(e) => setDateField(e.target.value as 'created_at' | 'due_date')}
          >
            <option value="created_at">{t('invoice.filters.createdDate')}</option>
            <option value="due_date">{t('invoice.filters.dueDate')}</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Input className="h-11 rounded-md bg-surface-container-lowest" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input className="h-11 rounded-md bg-surface-container-lowest" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {(['all', 'pending', 'paid', 'overdue', 'cancelled'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                'h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition',
                status === value
                  ? 'border-primary bg-primary text-on-primary shadow-sm'
                  : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container',
              )}
              onClick={() => setStatus(value)}
            >
              {t(`invoice.statusTabs.${value}`)}
            </button>
          ))}
        </div>
      </section>

      {!invoicesQuery.isLoading && !invoices.length ? (
        <EmptyState icon="receipt_long" title={t('admin.invoices.emptyTitle')} description={t('admin.invoices.emptyDescription')} />
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-sm">
                <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                  <tr>
                    {['invoiceNo', 'parent', 'children', 'amount', 'type', 'status', 'dueDate', 'createdDate', 'actions'].map((key) => (
                      <th key={key} className="px-4 py-3 text-start font-semibold">{t(`invoice.table.${key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {invoices.map((row) => (
                    <tr key={row.id} className="bg-surface transition hover:bg-surface-container-lowest">
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          className="font-semibold text-primary hover:underline"
                          onClick={() => navigate(`/admin/invoices/${row.id}${qs}`)}
                        >
                          {row.invoiceNumber}
                        </button>
                      </td>
                      <td className="px-4 py-4 font-medium text-on-surface">{row.parentName}</td>
                      <td className="max-w-64 px-4 py-4 text-on-surface-variant">
                        <span className="line-clamp-2">{row.childNames.length ? row.childNames.join(', ') : '-'}</span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-on-surface">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</td>
                      <td className="px-4 py-4 text-on-surface-variant">{t(`invoice.types.${row.type}`)}</td>
                      <td className="px-4 py-4">
                        <span className={cn('inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold', statusBadgeClass(row.status))}>
                          {t(`invoice.status.${row.status}`)}
                        </span>
                        {row.status === 'overdue' ? <p className="mt-1 text-xs text-error">{t('invoice.overdueDays', { days: row.overdueDays })}</p> : null}
                      </td>
                      <td className="px-4 py-4 text-on-surface-variant">{new Date(row.dueDate).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-on-surface-variant">{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-4">{renderInvoiceActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-3 lg:hidden">
            {invoices.map((row) => (
              <article key={row.id} className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="break-words text-start font-semibold text-primary hover:underline"
                      onClick={() => navigate(`/admin/invoices/${row.id}${qs}`)}
                    >
                      {row.invoiceNumber}
                    </button>
                    <p className="mt-1 text-sm font-medium text-on-surface">{row.parentName}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{row.childNames.length ? row.childNames.join(', ') : '-'}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold', statusBadgeClass(row.status))}>
                    {t(`invoice.status.${row.status}`)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('invoice.table.amount')}</p>
                    <p className="font-semibold text-on-surface">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('invoice.table.type')}</p>
                    <p className="font-medium text-on-surface">{t(`invoice.types.${row.type}`)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('invoice.table.dueDate')}</p>
                    <p className="font-medium text-on-surface">{new Date(row.dueDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant">{t('invoice.table.createdDate')}</p>
                    <p className="font-medium text-on-surface">{new Date(row.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {row.status === 'overdue' ? <p className="mt-3 text-xs font-medium text-error">{t('invoice.overdueDays', { days: row.overdueDays })}</p> : null}
                <div className="mt-4 border-t border-outline-variant pt-3">{renderInvoiceActions(row)}</div>
              </article>
            ))}
          </section>
        </>
      )}

      <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
        <Button
          className="rounded-md"
          variant="outline"
          onClick={() => invoicesQuery.setPage(Math.max(1, invoicesQuery.page - 1))}
          disabled={invoicesQuery.page === 1}
        >
          {t('common.previous')}
        </Button>
        <p className="text-xs font-medium text-on-surface-variant">{t('invoice.page', { page: invoicesQuery.page })}</p>
        <Button
          className="rounded-md"
          variant="outline"
          onClick={() => invoicesQuery.setPage(invoicesQuery.page + 1)}
          disabled={invoices.length < invoicesQuery.pageSize}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
