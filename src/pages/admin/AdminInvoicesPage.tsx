import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceActionsMenu } from '@/components/admin/InvoiceActionsMenu';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePager,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
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

const STATUS_TONE: Record<AdminInvoiceItem['status'], PillTone> = {
  paid: 'success',
  overdue: 'error',
  cancelled: 'neutral',
  pending: 'warning',
};

export function AdminInvoicesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const dateLocale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const formatDay = (value: string) => new Date(value).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });

  const [status, setStatus] = useState<AdminInvoiceStatusFilter>('all');
  // ?type=extra_hours (e.g. from the financial dashboard) opens the list on that type.
  const [type, setType] = useState<AdminInvoiceTypeFilter>(() => {
    const fromUrl = searchParams.get('type');
    return fromUrl === 'monthly' || fromUrl === 'event' || fromUrl === 'extra_hours' || fromUrl === 'other' ? fromUrl : 'all';
  });
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
      .reduce((sum, row) => sum + row.balance, 0);
    const paidThisMonth = invoices.reduce((sum, row) => sum + row.paidThisMonth, 0);
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

  const filtersActive =
    status !== 'all' || type !== 'all' || sort !== 'created_desc' || dateField !== 'created_at' || Boolean(search.trim() || fromDate || toDate);
  const clearFilters = () => {
    setStatus('all');
    setType('all');
    setSearch('');
    setSort('created_desc');
    setDateField('created_at');
    setFromDate('');
    setToDate('');
  };

  const onMarkPaid = async (
    invoiceId: string,
    payload: { paymentMethod: string; paidAt: string; notes: string; idempotencyKey: string },
    amount: number,
  ) => {
    // The server records at most the unpaid balance and nothing for an invoice already paid.
    const result = await markInvoiceAsPaid({
      invoiceId,
      amount,
      paymentMethod: payload.paymentMethod,
      paidAt: payload.paidAt,
      idempotencyKey: payload.idempotencyKey,
    });
    toast.success(t(result.status === 'recorded' ? 'invoice.markPaid.success' : 'invoice.markPaid.alreadyPaid'));
    await invoicesQuery.refetch();
  };

  const onCancel = async (invoiceId: string) => {
    await cancelInvoice({ invoiceId });
    toast.success(t('invoice.cancel.success'));
    await invoicesQuery.refetch();
  };

  const renderInvoiceActions = (row: AdminInvoiceItem, compact = false) => (
    <InvoiceActionsMenu
      compact={compact}
      disabled={row.status === 'paid' || row.status === 'cancelled'}
      onView={() => navigate(`/admin/invoices/${row.id}${qs}`)}
      amountLabel={t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}
      onMarkPaid={(payload) => onMarkPaid(row.id, payload, row.amount)}
      onCancel={() => onCancel(row.id)}
    />
  );

  const statusPill = (row: AdminInvoiceItem) => (
    <StatusPill tone={STATUS_TONE[row.status] ?? 'neutral'}>{t(`invoice.status.${row.status}`)}</StatusPill>
  );

  const page = invoicesQuery.page;
  const pageSize = invoicesQuery.pageSize;
  const hasNext = invoices.length >= pageSize;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="receipt_long"
        title={t('admin.invoices.title')}
        description={t('admin.invoices.subtitle')}
        actions={
          <Button asChild>
            <Link to={`/admin/invoices/new${qs}`}>
              <span className="material-symbols-outlined me-1 text-lg" aria-hidden>add</span>
              {t('invoice.create.newInvoice')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="account_balance_wallet"
            label={t('invoice.summary.totalOutstanding')}
            value={t('invoice.egpAmount', { amount: summary.outstanding.toFixed(2) })}
            tone={summary.outstanding > 0 ? 'warning' : 'success'}
          />
          <StatTile
            icon="payments"
            label={t('invoice.summary.paidThisMonth')}
            value={t('invoice.egpAmount', { amount: summary.paidThisMonth.toFixed(2) })}
            tone="success"
          />
          <StatTile
            icon="priority_high"
            label={t('invoice.summary.overdueCount')}
            value={summary.overdueCount}
            tone={summary.overdueCount > 0 ? 'error' : 'success'}
            onClick={() => setStatus((current) => (current === 'overdue' ? 'all' : 'overdue'))}
            active={status === 'overdue'}
          />
          <StatTile icon="timer" label={t('invoice.summary.avgDaysToPayment')} value={t('invoice.days', { count: summary.avgDays })} tone="neutral" />
        </div>
      </PageHeader>

      <TableCard
        title={t('admin.invoices.title')}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('invoice.filters.search')} />
            </FilterField>
            <FilterField label={t('common.status')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value as AdminInvoiceStatusFilter)}>
                {(['all', 'pending', 'paid', 'overdue', 'cancelled'] as const).map((value) => (
                  <option key={value} value={value}>{t(`invoice.statusTabs.${value}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('invoice.table.type')}>
              <Select value={type} onChange={(e) => setType(e.target.value as AdminInvoiceTypeFilter)}>
                {(['all', 'monthly', 'event', 'extra_hours', 'other'] as const).map((value) => (
                  <option key={value} value={value}>{t(`invoice.filters.types.${value}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('common.sort')}>
              <Select value={sort} onChange={(e) => setSort(e.target.value as AdminInvoiceSort)}>
                {(['created_desc', 'created_asc', 'amount_desc', 'amount_asc', 'due_date_asc', 'due_date_desc'] as const).map((value) => (
                  <option key={value} value={value}>{t(`invoice.filters.sort.${value}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('admin.invoices.dateFieldLabel')}>
              <Select value={dateField} onChange={(e) => setDateField(e.target.value as 'created_at' | 'due_date')}>
                <option value="created_at">{t('invoice.filters.createdDate')}</option>
                <option value="due_date">{t('invoice.filters.dueDate')}</option>
              </Select>
            </FilterField>
            <FilterField label={t('common.fromDate')}>
              <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
            </FilterField>
            <FilterField label={t('common.toDate')}>
              <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
            </FilterField>
          </FilterBar>
        }
        pagination={
          invoicesQuery.isLoading || (!invoices.length && page === 1) ? null : (
            <TablePager
              page={page}
              pageCount={hasNext ? page + 1 : page}
              startIndex={invoices.length ? (page - 1) * pageSize + 1 : 0}
              endIndex={(page - 1) * pageSize + invoices.length}
              hasPrev={page > 1}
              hasNext={hasNext}
              onPrev={() => invoicesQuery.setPage(Math.max(1, page - 1))}
              onNext={() => invoicesQuery.setPage(page + 1)}
            />
          )
        }
      >
        {invoicesQuery.isLoading ? (
          <TableLoading />
        ) : !invoices.length ? (
          <TableEmpty icon="receipt_long" title={t('admin.invoices.emptyTitle')} description={t('admin.invoices.emptyDescription')} />
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable minWidth={1060}>
                <THead>
                  <Th>{t('invoice.table.invoiceNo')}</Th>
                  <Th>{t('invoice.table.parent')}</Th>
                  <Th>{t('invoice.table.children')}</Th>
                  <Th>{t('invoice.table.amount')}</Th>
                  <Th>{t('invoice.table.type')}</Th>
                  <Th>{t('invoice.table.status')}</Th>
                  <Th>{t('invoice.table.dueDate')}</Th>
                  <Th>{t('invoice.table.createdDate')}</Th>
                  <Th align="end">{t('invoice.table.actions')}</Th>
                </THead>
                <TBody>
                  {invoices.map((row) => (
                    <Tr key={row.id} onClick={() => navigate(`/admin/invoices/${row.id}${qs}`)}>
                      <Td className="whitespace-nowrap font-semibold text-primary">{row.invoiceNumber}</Td>
                      <Td className="font-medium text-on-surface">{row.parentName}</Td>
                      <Td className="max-w-64 text-on-surface-variant">
                        <span className="line-clamp-2">{row.childNames.length ? row.childNames.join(', ') : '—'}</span>
                      </Td>
                      <Td className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</Td>
                      <Td className="text-on-surface-variant">{t(`invoice.types.${row.type}`)}</Td>
                      <Td>
                        {statusPill(row)}
                        {row.status === 'overdue' ? <p className="mt-1 text-xs text-error">{t('invoice.overdueDays', { days: row.overdueDays })}</p> : null}
                      </Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">{formatDay(row.dueDate)}</Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">{formatDay(row.createdAt)}</Td>
                      <Td align="end">{renderInvoiceActions(row, true)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </DataTable>
            </div>

            <ul className="divide-y divide-outline-variant lg:hidden">
              {invoices.map((row) => (
                <li key={row.id} className="p-4">
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
                      <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{row.childNames.length ? row.childNames.join(', ') : '—'}</p>
                    </div>
                    {statusPill(row)}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-on-surface-variant">{t('invoice.table.amount')}</p>
                      <p className="font-semibold tabular-nums text-on-surface">{t('invoice.egpAmount', { amount: row.amount.toFixed(2) })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant">{t('invoice.table.type')}</p>
                      <p className="font-medium text-on-surface">{t(`invoice.types.${row.type}`)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant">{t('invoice.table.dueDate')}</p>
                      <p className="font-medium text-on-surface">{formatDay(row.dueDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant">{t('invoice.table.createdDate')}</p>
                      <p className="font-medium text-on-surface">{formatDay(row.createdAt)}</p>
                    </div>
                  </div>
                  {row.status === 'overdue' ? <p className="mt-3 text-xs font-medium text-error">{t('invoice.overdueDays', { days: row.overdueDays })}</p> : null}
                  <div className="mt-3 border-t border-outline-variant pt-3">{renderInvoiceActions(row)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </TableCard>
    </div>
  );
}
