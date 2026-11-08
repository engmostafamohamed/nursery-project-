import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { BalanceHero } from '@/features/parent-billing/BalanceHero';
import { InvoiceListItem } from '@/features/parent-billing/InvoiceListItem';
import { billingSummary, isPayable, localName, type BillingInvoice } from '@/features/parent-billing/parentBilling';
import { useParentBilling } from '@/features/parent-billing/useParentBilling';
import { usePagination } from '@/hooks/usePagination';
import { useParentChildren } from '@/hooks/useParentChildren';
import { invoiceItemDescription, invoiceRawItems } from '@/lib/invoiceItems';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'open' | 'paid';
type Sort = 'due_soon' | 'newest';
const STATUS_FILTERS: StatusFilter[] = ['all', 'open', 'paid'];

/** The parent's bills: what they owe at the top, then every invoice in short cards. */
export function ParentInvoicesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status');
  const highlightId = searchParams.get('highlight');
  const [status, setStatus] = useState<StatusFilter>(initialStatus === 'pending' ? 'open' : initialStatus === 'paid' ? 'paid' : 'all');
  const [sort, setSort] = useState<Sort>('due_soon');
  const [childId, setChildId] = useState(searchParams.get('child') ?? '');
  const [search, setSearch] = useState('');

  const billing = useParentBilling();
  const all = useMemo(() => billing.data ?? [], [billing.data]);
  const childrenQuery = useParentChildren();
  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const isArabic = i18n.language.startsWith('ar');
  const childName = useMemo(
    () => new Map(children.map((c) => [c.id, localName({ name_ar: c.nameAr, name_en: c.nameEn }, isArabic)])),
    [children, isArabic],
  );

  // The figures at the top count the chosen child's invoices, whatever the status filter.
  const forChild = useMemo(() => (childId ? all.filter((i) => i.childIds.includes(childId)) : all), [all, childId]);
  const summary = useMemo(() => billingSummary(forChild), [forChild]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (i: BillingInvoice) => {
      if (!term) return true;
      const first = invoiceRawItems(i.lineItems)[0];
      return i.invoiceNumber.toLowerCase().includes(term) || (first ? invoiceItemDescription(first, i18n.language).toLowerCase().includes(term) : false);
    };
    const rows = forChild.filter(
      (i) => matches(i) && (status === 'all' || (status === 'paid' ? i.status === 'paid' : i.status === 'pending' || i.status === 'overdue')),
    );
    if (sort === 'newest') return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // Soonest first: what is still to pay by due date, then the rest, latest first.
    const open = rows.filter(isPayable).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const rest = rows.filter((i) => !isPayable(i)).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    return [...open, ...rest];
  }, [forChild, search, status, sort, i18n.language]);

  const pager = usePagination(shown, 10, `${status}|${sort}|${childId}|${search}`);
  const { page, pageSize, setPage } = pager;

  // A link to one invoice (?highlight=) opens the page it is on, then scrolls to it once.
  const highlightShown = useRef(false);
  useEffect(() => {
    if (!highlightId || billing.isLoading || highlightShown.current) return;
    const index = shown.findIndex((i) => i.id === highlightId);
    if (index < 0) return;
    const target = Math.floor(index / pageSize) + 1;
    if (page !== target) {
      setPage(target);
      return;
    }
    highlightShown.current = true;
    document.getElementById(`invoice-card-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, billing.isLoading, shown, page, pageSize, setPage]);

  const pay = (invoiceId: string) => navigate(`/parent/invoices/${invoiceId}/pay?returnTo=${encodeURIComponent('/parent/invoices')}`);
  const filtersActive = status !== 'all' || Boolean(childId) || Boolean(search.trim()) || sort !== 'due_soon';
  const clearFilters = () => {
    setStatus('all');
    setChildId('');
    setSearch('');
    setSort('due_soon');
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-28">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-on-surface">{t('parent.invoices.title')}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/parent/payment-record">
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>history</span>
            {t('parent.paymentRecord.title')}
          </Link>
        </Button>
      </div>

      {billing.isLoading ? <Skeleton className="h-36 rounded-xl" /> : <BalanceHero summary={summary} onPay={pay} />}

      <div role="tablist" aria-label={t('parentBilling.list.filterLabel')} className="flex gap-2 overflow-x-auto">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-lowest',
            )}
          >
            {t(`parentBilling.list.filters.${value}`)}
          </button>
        ))}
      </div>

      <TableCard
        title={t(`parentBilling.list.filters.${status}`)}
        count={t('parent.invoices.resultsCount', { count: shown.length })}
        filters={
          all.length ? (
            <FilterBar onClear={clearFilters} canClear={filtersActive}>
              <FilterField label={t('common.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('parent.invoices.searchPlaceholder')} />
              </FilterField>
              {children.length > 1 ? (
                <FilterField label={t('parent.invoices.childFilter')}>
                  <Select value={childId} onChange={(e) => setChildId(e.target.value)}>
                    <option value="">{t('parent.invoices.allChildren')}</option>
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>{childName.get(c.id)}</option>
                    ))}
                  </Select>
                </FilterField>
              ) : null}
              <FilterField label={t('parent.invoices.sortLabel')} className="sm:min-w-[14rem]">
                <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="due_soon">{t('invoice.filters.parentSortDueSoon')}</option>
                  <option value="newest">{t('invoice.filters.parentSortNewest')}</option>
                </Select>
              </FilterField>
            </FilterBar>
          ) : null
        }
        pagination={shown.length ? <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} /> : null}
      >
        {billing.isLoading ? (
          <TableLoading />
        ) : !all.length ? (
          <TableEmpty icon="receipt_long" title={t('parent.invoices.emptyTitle')} description={t('parent.invoices.emptyHint')} />
        ) : !shown.length ? (
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
          <div className="space-y-2 p-3 sm:p-4">
            {pager.pageItems.map((invoice) => (
              <InvoiceListItem
                key={invoice.id}
                invoice={invoice}
                highlighted={invoice.id === highlightId}
                childNames={children.length > 1 ? invoice.childIds.map((id) => childName.get(id) ?? '').filter(Boolean) : []}
                onOpen={() => navigate(`/parent/invoices/${invoice.id}`)}
                onPay={() => pay(invoice.id)}
              />
            ))}
          </div>
        )}
      </TableCard>
    </div>
  );
}
