import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { InvoiceCard } from '@/components/parent/InvoiceCard';
import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useParentChildren } from '@/hooks/useParentChildren';
import {
  useParentInvoices,
  type ParentInvoiceSort,
  type ParentInvoiceStatusFilter,
} from '@/hooks/useParentInvoices';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';

export function ParentInvoicesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const { user } = useAuthSession();
  const initialStatus = searchParams.get('status');
  const initialChildId = searchParams.get('child') ?? '';
  const highlightId = searchParams.get('highlight');
  const [status, setStatus] = useState<ParentInvoiceStatusFilter>(
    initialStatus === 'pending' || initialStatus === 'paid' ? initialStatus : 'all',
  );
  const [sort, setSort] = useState<ParentInvoiceSort>('due_soon');
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [search, setSearch] = useState('');

  const childrenQuery = useParentChildren();
  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const invoicesQuery = useParentInvoices({
    parentId: user?.id,
    childId: selectedChildId || undefined,
    status,
    sort,
  });

  const childNameById = useMemo(() => {
    const isAr = i18n.language.startsWith('ar');
    return new Map(children.map((child) => [child.id, (isAr ? child.nameAr || child.nameEn : child.nameEn || child.nameAr) || '']));
  }, [children, i18n.language]);

  const invoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? invoicesQuery.data.filter((row) => row.invoiceNumber.toLowerCase().includes(term) || row.description.toLowerCase().includes(term))
      : invoicesQuery.data;
    if (sort !== 'due_soon') return rows;
    // Soonest first: the invoices still to pay come first, then paid and cancelled ones, latest first.
    const settled = (row: (typeof rows)[number]) => row.status === 'paid' || row.status === 'cancelled';
    return [...rows.filter((row) => !settled(row)), ...rows.filter(settled).reverse()];
  }, [invoicesQuery.data, search, sort]);

  const pager = usePagination(invoices, 6, `${status}|${sort}|${selectedChildId}|${search}`);
  const { page, pageSize, setPage } = pager;

  // Paying always goes through the pay page: amount, method and reference, then a confirmation.
  const handlePayNow = (invoiceId: string) => {
    const returnTo = encodeURIComponent('/parent/invoices');
    navigate(`/parent/invoices/${invoiceId}/pay?returnTo=${returnTo}${isPreview ? '&preview=true' : ''}`);
  };

  // A link to one invoice (?highlight=) opens the page it is on, then scrolls to it once.
  const highlightShown = useRef(false);
  useEffect(() => {
    if (!highlightId || invoicesQuery.isLoading || highlightShown.current) return;
    const index = invoices.findIndex((row) => row.id === highlightId);
    if (index < 0) return;
    const targetPage = Math.floor(index / pageSize) + 1;
    if (page !== targetPage) {
      setPage(targetPage);
      return;
    }
    highlightShown.current = true;
    document.getElementById(`invoice-card-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, invoicesQuery.isLoading, invoices, page, pageSize, setPage]);

  // The tiles count every invoice of the chosen child, so they stay put while the status filter changes.
  const summary = useMemo(() => {
    const rows = selectedChildId ? invoicesQuery.allData.filter((row) => row.childIds.includes(selectedChildId)) : invoicesQuery.allData;
    const dueRows = rows.filter((row) => (row.status === 'pending' || row.status === 'overdue') && row.balance > 0);
    return {
      total: rows.length,
      totalDue: dueRows.reduce((sum, row) => sum + row.balance, 0),
      dueCount: dueRows.length,
      overdueCount: dueRows.filter((row) => row.status === 'overdue').length,
      paidCount: rows.filter((row) => row.status === 'paid').length,
      nextDue: [...dueRows].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0],
    };
  }, [invoicesQuery.allData, selectedChildId]);

  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const toggleStatus = (value: ParentInvoiceStatusFilter) => setStatus((current) => (current === value ? 'all' : value));
  const filtersActive = status !== 'all' || Boolean(selectedChildId) || Boolean(search.trim()) || sort !== 'due_soon';
  const clearFilters = () => {
    setStatus('all');
    setSelectedChildId('');
    setSearch('');
    setSort('due_soon');
  };
  const hasInvoices = invoicesQuery.allData.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-28">
      <PageHeader
        icon="receipt_long"
        eyebrow={t('parent.dashboard.sectionFinancial')}
        title={t('parent.invoices.title')}
        description={t('parent.invoices.subtitle')}
        actions={
          <Button asChild variant="outline">
            <Link to="/parent/payment-record">
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>history</span>
              {t('parent.paymentRecord.title')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="receipt_long" label={t('parent.invoices.allInvoices')} value={summary.total} onClick={() => setStatus('all')} active={status === 'all'} />
          <StatTile
            icon="account_balance_wallet"
            label={t('parent.invoices.totalDue')}
            value={money(summary.totalDue)}
            tone={summary.overdueCount > 0 ? 'error' : summary.totalDue > 0 ? 'warning' : 'success'}
            helper={
              summary.overdueCount > 0
                ? t('parent.invoices.overdueCount', { count: summary.overdueCount })
                : t('parent.invoices.openCount', { count: summary.dueCount })
            }
            onClick={() => toggleStatus('pending')}
            active={status === 'pending'}
          />
          <StatTile
            icon="event_upcoming"
            label={t('parent.invoices.nextDue')}
            value={summary.nextDue ? formatDate(summary.nextDue.dueDate) : '—'}
            helper={summary.nextDue ? money(summary.nextDue.balance) : t('parent.invoices.nothingDue')}
            tone={summary.nextDue ? 'primary' : 'neutral'}
          />
          <StatTile
            icon="task_alt"
            label={t('invoice.status.paid')}
            value={summary.paidCount}
            tone="success"
            onClick={() => toggleStatus('paid')}
            active={status === 'paid'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t(`invoice.statusTabs.${status}`)}
        count={t('parent.invoices.resultsCount', { count: invoices.length })}
        filters={
          hasInvoices ? (
            <FilterBar onClear={clearFilters} canClear={filtersActive}>
              <FilterField label={t('common.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('parent.invoices.searchPlaceholder')} />
              </FilterField>
              {children.length > 1 ? (
                <FilterField label={t('parent.invoices.childFilter')}>
                  <Select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                    <option value="">{t('parent.invoices.allChildren')}</option>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>{childNameById.get(child.id)}</option>
                    ))}
                  </Select>
                </FilterField>
              ) : null}
              {/* The tiles above filter by status. */}
              <FilterField label={t('parent.invoices.sortLabel')} className="sm:min-w-[14rem]">
                <Select value={sort} onChange={(e) => setSort(e.target.value as ParentInvoiceSort)}>
                  <option value="due_soon">{t('invoice.filters.parentSortDueSoon')}</option>
                  <option value="newest">{t('invoice.filters.parentSortNewest')}</option>
                </Select>
              </FilterField>
            </FilterBar>
          ) : null
        }
        pagination={invoices.length ? <TablePagination pager={pager} pageSizeOptions={[6, 12, 24]} /> : null}
      >
        {invoicesQuery.isLoading ? (
          <TableLoading />
        ) : !hasInvoices ? (
          <TableEmpty icon="receipt_long" title={t('parent.invoices.emptyTitle')} description={t('parent.invoices.emptyHint')} />
        ) : !invoices.length ? (
          <TableEmpty
            icon="filter_alt_off"
            title={t('parent.invoices.emptyFiltered')}
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                {t('common.clearFilters')}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
            {pager.pageItems.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                highlighted={Boolean(highlightId && invoice.id === highlightId)}
                childNames={children.length > 1 ? invoice.childIds.map((id) => childNameById.get(id) ?? '').filter(Boolean) : []}
                onPayNow={() => handlePayNow(invoice.id)}
                onView={() => navigate(`/parent/invoices/${invoice.id}${qs}`)}
              />
            ))}
          </div>
        )}
      </TableCard>
    </div>
  );
}
