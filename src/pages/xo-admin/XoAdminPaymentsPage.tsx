import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { LoadError } from '@/components/ui/LoadError';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  useXoPaymentAttempts,
  useXoPaymentCounts,
  type XoPaymentStatus,
  type XoPaymentStatusFilter,
} from '@/hooks/useXoPaymentAttempts';
import { localName } from '@/lib/bilingualName';

const PAGE_SIZES = [20, 50, 100];

const STATUS_META: Record<XoPaymentStatus, { labelKey: string; tone: PillTone }> = {
  pending_confirmation: { labelKey: 'xoAdmin.payments.statusPending', tone: 'warning' },
  confirmed: { labelKey: 'xoAdmin.payments.statusConfirmed', tone: 'success' },
  cancelled: { labelKey: 'xoAdmin.payments.statusRejected', tone: 'error' },
  failed: { labelKey: 'xoAdmin.payments.statusFailed', tone: 'error' },
};

export function XoAdminPaymentsPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar') ?? false;
  const locale = isArabic ? 'ar-EG' : 'en-GB';
  const [status, setStatus] = useState<XoPaymentStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const debouncedSearch = useDebouncedValue(search.trim(), 350);

  // Any change of filter, search or page size starts again from the first page.
  const filterKey = `${status}|${debouncedSearch}|${pageSize}`;
  const [paging, setPaging] = useState({ filterKey, page: 1 });
  const page = paging.filterKey === filterKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ filterKey, page: next });

  const counts = useXoPaymentCounts();
  const attempts = useXoPaymentAttempts({ status, search: debouncedSearch, page, pageSize });
  const rows = attempts.data?.rows ?? [];
  const total = attempts.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const loading = attempts.isPending && !attempts.data;

  const filtersActive = status !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setStatus('all');
    setSearch('');
  };
  const toggle = (value: XoPaymentStatusFilter) => setStatus((current) => (current === value ? 'all' : value));

  const name = (n: { ar: string | null; en: string | null } | null) => (n ? localName(n.ar, n.en, isArabic) || '—' : '—');
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : '—');
  const tile = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString(locale));
  const fmtAmount = (n: number) => t('invoice.egpAmount', { amount: n.toFixed(2) });

  return (
    <div className="space-y-5 pb-8">
      <PageHeader icon="payments" title={t('xoAdmin.payments.title')} description={t('xoAdmin.payments.subtitle')}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="receipt_long" label={t('xoAdmin.payments.filter.all')} value={tile(counts.data?.total)} onClick={clearFilters} active={!filtersActive} />
          <StatTile
            icon="pending_actions"
            label={t('xoAdmin.payments.filter.pending_confirmation')}
            value={tile(counts.data?.pending)}
            tone={(counts.data?.pending ?? 0) > 0 ? 'warning' : 'neutral'}
            onClick={() => toggle('pending_confirmation')}
            active={status === 'pending_confirmation'}
          />
          <StatTile
            icon="task_alt"
            label={t('xoAdmin.payments.filter.confirmed')}
            value={tile(counts.data?.confirmed)}
            tone="success"
            onClick={() => toggle('confirmed')}
            active={status === 'confirmed'}
          />
          <StatTile
            icon="block"
            label={t('xoAdmin.payments.filter.cancelled')}
            value={tile(counts.data?.rejected)}
            tone={(counts.data?.rejected ?? 0) > 0 ? 'error' : 'neutral'}
            onClick={() => toggle('cancelled')}
            active={status === 'cancelled'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('xoAdmin.payments.title')}
        count={loading ? undefined : t('xoAdmin.payments.count', { count: total })}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('xoAdmin.payments.col.status')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value as XoPaymentStatusFilter)}>
                {(['all', 'pending_confirmation', 'confirmed', 'cancelled'] as const).map((value) => (
                  <option key={value} value={value}>{t(`xoAdmin.payments.filter.${value}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('xoAdmin.payments.searchPlaceholder')} />
            </FilterField>
          </FilterBar>
        }
        pagination={
          total > 0 ? (
            <TablePager
              page={page}
              pageCount={pageCount}
              total={total}
              startIndex={(page - 1) * pageSize + 1}
              endIndex={(page - 1) * pageSize + rows.length}
              hasPrev={page > 1}
              hasNext={page < pageCount}
              onPrev={() => setPage(Math.max(1, page - 1))}
              onNext={() => setPage(Math.min(pageCount, page + 1))}
              onPageChange={setPage}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={setPageSize}
            />
          ) : null
        }
      >
        {attempts.isError && !attempts.data ? (
          <LoadError inset message={t('xoAdmin.payments.loadError')} onRetry={() => void attempts.refetch()} />
        ) : loading ? (
          <TableLoading />
        ) : !rows.length ? (
          filtersActive ? (
            <TableEmpty
              icon="filter_alt_off"
              title={t('xoAdmin.payments.noMatch')}
              action={
                <Button type="button" variant="outline" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              }
            />
          ) : (
            <TableEmpty icon="payments" title={t('xoAdmin.payments.emptyTitle')} description={t('xoAdmin.payments.emptyDescription')} />
          )
        ) : (
          <DataTable minWidth={820} className={attempts.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <THead>
              <Th>{t('xoAdmin.payments.col.nursery')}</Th>
              <Th>{t('xoAdmin.payments.col.parent')}</Th>
              <Th>{t('xoAdmin.payments.col.invoice')}</Th>
              <Th align="end">{t('xoAdmin.payments.col.amount')}</Th>
              <Th>{t('xoAdmin.payments.col.submitted')}</Th>
              <Th>{t('xoAdmin.payments.col.status')}</Th>
              <Th>{t('xoAdmin.payments.col.handledBy')}</Th>
            </THead>
            <TBody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <Tr key={r.id}>
                    <Td className="font-semibold text-on-surface">{name(r.nursery)}</Td>
                    <Td className="text-on-surface">{name(r.parent)}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{t('invoice.invoiceNumber', { number: r.invoiceNumber })}</Td>
                    <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{fmtAmount(r.amount)}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{fmtDate(r.createdAt)}</Td>
                    <Td>
                      <StatusPill tone={meta.tone}>{t(meta.labelKey)}</StatusPill>
                    </Td>
                    <Td className="text-on-surface-variant">
                      {r.status === 'confirmed' || r.status === 'cancelled' ? (
                        <div>
                          <p className="text-on-surface">{name(r.confirmedBy)}</p>
                          <p className="text-xs">{fmtDate(r.confirmedAt)}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}
