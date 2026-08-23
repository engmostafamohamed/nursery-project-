import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceActionsMenu } from '@/components/admin/InvoiceActionsMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useAdminInvoices,
  type AdminInvoiceSort,
  type AdminInvoiceStatusFilter,
  type AdminInvoiceTypeFilter,
} from '@/hooks/useAdminInvoices';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

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
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date(payload.paidAt).toISOString(),
        payment_method: payload.paymentMethod,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', invoiceId);
    if (error) throw error;
    await supabase.from('notifications').insert({
      nursery_id: profile?.nursery_id,
      user_id: parentId,
      type: 'invoice_paid',
      title_ar: 'تم تأكيد سداد الفاتورة',
      title_en: 'Invoice payment confirmed',
      body_ar: `تم تأكيد سداد الفاتورة ${invoiceNumber} بقيمة ${amount} جنيه.`,
      body_en: `Invoice ${invoiceNumber} payment of EGP ${amount} has been confirmed.`,
      channel: 'push',
      read: false,
      sent_at: new Date().toISOString(),
    } as never);
    toast.success(t('invoice.markPaid.success'));
    await invoicesQuery.refetch();
  };

  const onCancel = async (invoiceId: string) => {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() } as never)
      .eq('id', invoiceId);
    if (error) throw error;
    toast.success(t('invoice.cancel.success'));
    await invoicesQuery.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.invoices.title')}</h1>
        <Button asChild>
          <Link to={`/admin/invoices/new${qs}`}>{t('invoice.create.newInvoice')}</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('invoice.summary.totalOutstanding')}</p><p className="text-lg font-bold">{t('invoice.egpAmount', { amount: summary.outstanding.toFixed(2) })}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('invoice.summary.paidThisMonth')}</p><p className="text-lg font-bold">{t('invoice.egpAmount', { amount: summary.paidThisMonth.toFixed(2) })}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('invoice.summary.overdueCount')}</p><p className="text-lg font-bold text-error">{summary.overdueCount}</p></div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs">{t('invoice.summary.avgDaysToPayment')}</p><p className="text-lg font-bold">{t('invoice.days', { count: summary.avgDays })}</p></div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 md:grid-cols-5">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('invoice.filters.search')} />
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as AdminInvoiceTypeFilter)}>
          {(['all', 'monthly', 'event', 'extra_hours', 'other'] as const).map((value) => <option key={value} value={value}>{t(`invoice.filters.types.${value}`)}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value as AdminInvoiceSort)}>
          {(['created_desc', 'created_asc', 'amount_desc', 'amount_asc', 'due_date_asc', 'due_date_desc'] as const).map((value) => <option key={value} value={value}>{t(`invoice.filters.sort.${value}`)}</option>)}
        </select>
        <select className="h-11 rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm" value={dateField} onChange={(e) => setDateField(e.target.value as 'created_at' | 'due_date')}>
          <option value="created_at">{t('invoice.filters.createdDate')}</option>
          <option value="due_date">{t('invoice.filters.dueDate')}</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'paid', 'overdue', 'cancelled'] as const).map((value) => (
          <button key={value} type="button" className={`rounded-full px-3 py-1 text-xs ${status === value ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`} onClick={() => setStatus(value)}>
            {t(`invoice.statusTabs.${value}`)}
          </button>
        ))}
      </div>

      {!invoicesQuery.isLoading && !invoices.length ? (
        <EmptyState icon="receipt_long" title={t('admin.invoices.emptyTitle')} description={t('admin.invoices.emptyDescription')} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-surface-container text-on-surface-variant">
              <tr>
                {['invoiceNo', 'parent', 'children', 'amount', 'type', 'status', 'dueDate', 'createdDate', 'actions'].map((key) => (
                  <th key={key} className="px-3 py-2 text-start">{t(`invoice.table.${key}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((row) => (
                <tr key={row.id} className="border-t border-outline-variant">
                  <td className="px-3 py-2 font-medium">{row.invoiceNumber}</td>
                  <td className="px-3 py-2">{row.parentName}</td>
                  <td className="px-3 py-2">{row.childNames.length ? row.childNames.join(', ') : '-'}</td>
                  <td className="px-3 py-2">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</td>
                  <td className="px-3 py-2">{t(`invoice.types.${row.type}`)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${row.status === 'overdue' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface-variant'}`}>
                      {t(`invoice.status.${row.status}`)}
                    </span>
                    {row.status === 'overdue' ? <p className="mt-1 text-xs text-error">{t('invoice.overdueDays', { days: row.overdueDays })}</p> : null}
                  </td>
                  <td className="px-3 py-2">{new Date(row.dueDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <InvoiceActionsMenu
                      disabled={row.status === 'paid' || row.status === 'cancelled'}
                      onView={() => navigate(`/admin/invoices/${row.id}${qs}`)}
                      onMarkPaid={(payload) => onMarkPaid(row.id, payload, row.parentId, row.invoiceNumber, row.amount)}
                      onCancel={() => onCancel(row.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => invoicesQuery.setPage(Math.max(1, invoicesQuery.page - 1))} disabled={invoicesQuery.page === 1}>
          {t('common.previous')}
        </Button>
        <p className="text-xs text-on-surface-variant">{t('invoice.page', { page: invoicesQuery.page })}</p>
        <Button variant="outline" onClick={() => invoicesQuery.setPage(invoicesQuery.page + 1)} disabled={invoices.length < invoicesQuery.pageSize}>
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
