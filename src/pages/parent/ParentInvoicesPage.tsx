import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterChips } from '@/components/ui/FilterChips';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FamilyDiscountsCard } from '@/features/discounts/FamilyDiscountsCard';
import { BalanceHero } from '@/features/parent-billing/BalanceHero';
import { InvoiceListItem } from '@/features/parent-billing/InvoiceListItem';
import { billingSummary, isPayable, localName, type BillingInvoice } from '@/features/parent-billing/parentBilling';
import { useParentBilling } from '@/features/parent-billing/useParentBilling';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useParentChildren } from '@/hooks/useParentChildren';
import { useUserProfile } from '@/hooks/useUserProfile';
import { invoiceItemDescription, invoiceRawItems } from '@/lib/invoiceItems';

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
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  // A discount notification opens the page at the family's discounts.
  const { hash } = useLocation();
  const discountsShown = useRef(false);
  useEffect(() => {
    if (hash !== '#discounts' || !profile?.nursery_id || discountsShown.current) return;
    discountsShown.current = true;
    document.getElementById('discounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, profile?.nursery_id]);
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
  const statusCounts = useMemo(
    () => ({
      all: forChild.length,
      open: forChild.filter((i) => i.status === 'pending' || i.status === 'overdue').length,
      paid: forChild.filter((i) => i.status === 'paid').length,
    }),
    [forChild],
  );

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
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <PageHeader
        icon="receipt_long"
        title={t('parent.invoices.title')}
        description={t('parent.invoices.description')}
        actions={
          <Button asChild variant="outline">
            <Link to="/parent/payment-record">
              <MaterialSymbol name="history" size="text-base" className="me-1" />
              {t('parent.paymentRecord.title')}
            </Link>
          </Button>
        }
      />

      {billing.isLoading ? <Skeleton className="h-36 rounded-xl" /> : <BalanceHero summary={summary} onPay={pay} />}

      <TableCard
        title={t(`parentBilling.list.filters.${status}`)}
        count={t('parent.invoices.resultsCount', { count: shown.length })}
        actions={
          <FilterChips
            label={t('parentBilling.list.filterLabel')}
            value={status}
            onChange={setStatus}
            options={STATUS_FILTERS.map((value) => ({ value, label: t(`parentBilling.list.filters.${value}`), count: statusCounts[value] }))}
          />
        }
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

      {/* The family's discounts: a partner's (asked for here, with its proof) and the sibling discount. */}
      {profile?.nursery_id ? (
        <div id="discounts" className="scroll-mt-24">
          <FamilyDiscountsCard
          nurseryId={profile.nursery_id}
          audience="family"
          family={{ parentId: profile.id, nameAr: profile.name_ar ?? '', nameEn: profile.name_en ?? '', phone: null, email: null, children: [] }}
          jobs={[profile.occupation]}
          />
        </div>
      ) : null}
    </div>
  );
}
