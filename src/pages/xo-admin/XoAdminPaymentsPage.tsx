import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DataTable,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { usePagination } from '@/hooks/usePagination';
import { useXoPaymentAttempts, type XoPaymentAttempt } from '@/hooks/useXoPaymentAttempts';

type StatusFilter = 'all' | XoPaymentAttempt['status'];

const STATUS_META: Record<XoPaymentAttempt['status'], { labelKey: string; tone: PillTone }> = {
  pending_confirmation: { labelKey: 'xoAdmin.payments.statusPending', tone: 'warning' },
  confirmed: { labelKey: 'xoAdmin.payments.statusConfirmed', tone: 'success' },
  cancelled: { labelKey: 'xoAdmin.payments.statusRejected', tone: 'error' },
  failed: { labelKey: 'xoAdmin.payments.statusFailed', tone: 'error' },
};

export function XoAdminPaymentsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const query = useXoPaymentAttempts();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      return !q || `${r.nurseryName} ${r.parentName} ${r.invoiceNumber}`.toLowerCase().includes(q);
    });
  }, [all, filter, search]);
  const counts = useMemo(
    () => ({
      pending: all.filter((r) => r.status === 'pending_confirmation').length,
      confirmed: all.filter((r) => r.status === 'confirmed').length,
      rejected: all.filter((r) => r.status === 'cancelled' || r.status === 'failed').length,
    }),
    [all],
  );
  const pager = usePagination(rows, 10, `${filter}|${search.trim().toLowerCase()}`);
  const filtersActive = filter !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setFilter('all');
    setSearch('');
  };
  const toggle = (value: StatusFilter) => setFilter((current) => (current === value ? 'all' : value));

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : '—');
  const fmtAmount = (n: number) => t('invoice.egpAmount', { amount: n.toFixed(2) });

  return (
    <div className="space-y-5 pb-8">
      <PageHeader icon="payments" title={t('xoAdmin.payments.title')} description={t('xoAdmin.payments.subtitle')}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="receipt_long" label={t('xoAdmin.payments.filter.all')} value={all.length} onClick={clearFilters} active={!filtersActive} />
          <StatTile
            icon="pending_actions"
            label={t('xoAdmin.payments.filter.pending_confirmation')}
            value={counts.pending}
            tone={counts.pending > 0 ? 'warning' : 'neutral'}
            onClick={() => toggle('pending_confirmation')}
            active={filter === 'pending_confirmation'}
          />
          <StatTile
            icon="task_alt"
            label={t('xoAdmin.payments.filter.confirmed')}
            value={counts.confirmed}
            tone="success"
            onClick={() => toggle('confirmed')}
            active={filter === 'confirmed'}
          />
          <StatTile
            icon="block"
            label={t('xoAdmin.payments.filter.cancelled')}
            value={counts.rejected}
            tone={counts.rejected > 0 ? 'error' : 'neutral'}
            onClick={() => toggle('cancelled')}
            active={filter === 'cancelled'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('xoAdmin.payments.title')}
        count={query.isLoading ? undefined : `${rows.length} / ${all.length}`}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('xoAdmin.payments.col.status')}>
              <Select value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
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
        pagination={query.isLoading || !rows.length ? null : <TablePagination pager={pager} />}
      >
        {query.isLoading ? (
          <TableLoading />
        ) : !rows.length ? (
          <TableEmpty icon="payments" title={t('xoAdmin.payments.emptyTitle')} description={t('xoAdmin.payments.emptyDescription')} />
        ) : (
          <DataTable minWidth={820}>
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
              {pager.pageItems.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <Tr key={r.id}>
                    <Td className="font-semibold text-on-surface">{r.nurseryName}</Td>
                    <Td className="text-on-surface">{r.parentName}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{t('invoice.invoiceNumber', { number: r.invoiceNumber })}</Td>
                    <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{fmtAmount(r.amount)}</Td>
                    <Td className="whitespace-nowrap text-on-surface-variant">{fmtDate(r.createdAt)}</Td>
                    <Td>
                      <StatusPill tone={meta.tone}>{t(meta.labelKey)}</StatusPill>
                    </Td>
                    <Td className="text-on-surface-variant">
                      {r.status === 'confirmed' || r.status === 'cancelled' ? (
                        <div>
                          <p className="text-on-surface">{r.confirmedByName ?? '—'}</p>
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
