import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
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
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useNurseriesAnalytics, type NurseryFilters, type NurseryWithAnalytics } from '@/hooks/useNurseriesAnalytics';
import { usePagination } from '@/hooks/usePagination';

type SortKey = 'name' | 'created' | 'children' | 'users' | 'invoices' | 'status';
type SortDir = 'asc' | 'desc';
type StatusValue = NonNullable<NurseryFilters['subscriptionStatus']>;

const STATUS_TONE: Record<string, PillTone> = {
  active: 'success',
  trial: 'primary',
  inactive: 'warning',
  expired: 'warning',
  cancelled: 'error',
  deleted: 'error',
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function nurseryInitials(n: NurseryWithAnalytics): string {
  const src = (n.name_en || n.name_ar || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function NurseryAvatar({ n }: { n: NurseryWithAnalytics }) {
  if (n.logo_url) {
    return (
      <img
        src={n.logo_url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-outline-variant"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
      {nurseryInitials(n)}
    </div>
  );
}

export function NurseryListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setActiveNurseryId } = useActiveNurseryId();
  const [filters, setFilters] = useState<NurseryFilters>({
    subscriptionStatus: 'all',
    subscriptionPlan: 'all',
    searchQuery: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const dateLocale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';

  const { data, isLoading, error, refetch } = useNurseriesAnalytics(filters);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setFilters((f) => ({ ...f, searchQuery: searchInput || undefined }));
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const clearFilters = () => {
    setFilters({ subscriptionStatus: 'all', subscriptionPlan: 'all', searchQuery: '' });
    setSearchInput('');
  };
  const status = filters.subscriptionStatus ?? 'all';
  const plan = filters.subscriptionPlan ?? 'all';
  const filtersActive = status !== 'all' || plan !== 'all' || Boolean(searchInput.trim());
  const toggleStatus = (value: StatusValue) =>
    setFilters((f) => ({ ...f, subscriptionStatus: f.subscriptionStatus === value ? 'all' : value }));

  const nurseries = useMemo(() => data ?? [], [data]);

  // KPI summary computed locally from the loaded list.
  const summary = useMemo(() => {
    const totals = { total: 0, active: 0, trial: 0, suspended: 0, cancelled: 0, deleted: 0, totalChildren: 0, totalUsers: 0 };
    for (const n of nurseries) {
      totals.total += 1;
      if (n.deleted_at || n.subscription_status === 'deleted') totals.deleted += 1;
      else if (n.subscription_status === 'active') totals.active += 1;
      else if (n.subscription_status === 'trial') totals.trial += 1;
      else if (n.subscription_status === 'cancelled') totals.cancelled += 1;
      else if (n.subscription_status === 'inactive' || n.suspended_at) totals.suspended += 1;
      totals.totalChildren += n.childCount ?? 0;
      totals.totalUsers += n.userCount ?? 0;
    }
    return totals;
  }, [nurseries]);

  const sorted = useMemo(() => {
    const arr = [...nurseries];
    const factor = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return ((a.name_en || a.name_ar || '').localeCompare(b.name_en || b.name_ar || '')) * factor;
        case 'children':
          return ((a.childCount ?? 0) - (b.childCount ?? 0)) * factor;
        case 'users':
          return ((a.userCount ?? 0) - (b.userCount ?? 0)) * factor;
        case 'invoices':
          return ((a.invoiceCount ?? 0) - (b.invoiceCount ?? 0)) * factor;
        case 'status':
          return ((a.subscription_status ?? '').localeCompare(b.subscription_status ?? '')) * factor;
        case 'created':
        default: {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return (ta - tb) * factor;
        }
      }
    });
    return arr;
  }, [nurseries, sortKey, sortDir]);

  // One page size for both views (12 fills the 2- and 3-column grid evenly).
  const pager = usePagination(sorted, 10, `${status}|${plan}|${searchInput}|${sortKey}|${sortDir}`);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };
  const sortFor = (key: SortKey) => ({ active: sortKey === key, direction: sortDir, onToggle: () => onSort(key) });

  const openNurseryDashboard = (nurseryId: string) => {
    setActiveNurseryId(nurseryId);
    navigate('/xo-admin/nursery');
  };

  const statusPill = (n: NurseryWithAnalytics) => {
    const value = n.deleted_at ? 'deleted' : n.subscription_status ?? 'trial';
    return <StatusPill tone={STATUS_TONE[value] ?? 'neutral'}>{t(`nurseries.status.${value}`, { defaultValue: value })}</StatusPill>;
  };

  const planPill = (n: NurseryWithAnalytics) =>
    n.subscription_plan ? (
      <StatusPill tone={n.subscription_plan === 'enterprise' ? 'primary' : 'neutral'} icon="workspace_premium">
        {t(`nurseries.plans.${n.subscription_plan}`, { defaultValue: n.subscription_plan })}
      </StatusPill>
    ) : null;

  const trialPill = (n: NurseryWithAnalytics) => {
    if (n.subscription_status !== 'trial' || !n.trial_ends_at) return null;
    const days = daysUntil(n.trial_ends_at);
    if (days === null) return null;
    const tone: PillTone = days <= 0 ? 'error' : days <= 7 ? 'warning' : 'primary';
    const label = days <= 0 ? t('xoAdmin.nurseryList.trialExpired') : t('xoAdmin.nurseryList.trialDaysLeft', { count: days });
    return <StatusPill tone={tone} icon="schedule">{label}</StatusPill>;
  };

  const rowActions = (n: NurseryWithAnalytics) => {
    const name = n.name_en || n.name_ar || '—';
    return (
      <div className="flex items-center justify-end gap-1">
        <IconAction icon="space_dashboard" label={`${t('xoAdmin.nurseryList.openDashboard')}: ${name}`} onClick={() => openNurseryDashboard(n.id)} />
        <IconAction icon="edit" label={`${t('common.edit')}: ${name}`} to={`/xo-admin/nurseries/${n.id}/edit`} />
        <IconAction icon="visibility" label={`${t('nurseries.actions.view')}: ${name}`} to={`/xo-admin/nurseries/${n.id}`} />
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="apartment"
        title={t('nurseries.list.title')}
        description={t('nurseries.list.subtitle')}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void refetch()} disabled={isLoading}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>refresh</span>
              {t('common.refresh')}
            </Button>
            <Button asChild>
              <Link to="/xo-admin/nurseries/new">
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
                {t('nurseries.actions.new')}
              </Link>
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5" aria-label={t('xoAdmin.nurseryList.summaryAria')}>
          <StatTile icon="apartment" label={t('xoAdmin.nurseryList.kpiTotal')} value={isLoading ? '—' : summary.total} onClick={clearFilters} active={!filtersActive} />
          <StatTile
            icon="check_circle"
            label={t('xoAdmin.nurseryList.kpiActive')}
            value={isLoading ? '—' : summary.active}
            tone="success"
            onClick={() => toggleStatus('active')}
            active={status === 'active'}
          />
          <StatTile
            icon="schedule"
            label={t('xoAdmin.nurseryList.kpiTrial')}
            value={isLoading ? '—' : summary.trial}
            onClick={() => toggleStatus('trial')}
            active={status === 'trial'}
          />
          <StatTile
            icon="pause_circle"
            label={t('xoAdmin.nurseryList.kpiSuspended')}
            value={isLoading ? '—' : summary.suspended}
            tone="warning"
            onClick={() => toggleStatus('inactive')}
            active={status === 'inactive'}
          />
          <StatTile
            icon="cancel"
            label={t('xoAdmin.nurseryList.kpiCancelled')}
            value={isLoading ? '—' : summary.cancelled + summary.deleted}
            tone="error"
            onClick={() => toggleStatus('cancelled')}
            active={status === 'cancelled'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('nurseries.list.title')}
        count={isLoading ? undefined : String(sorted.length)}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={searchInput} onChange={setSearchInput} placeholder={t('nurseries.list.searchPlaceholder')} />
            </FilterField>
            <FilterField label={t('xoAdmin.nurseryList.colStatus')}>
              <Select
                value={status}
                onChange={(e) => setFilters((f) => ({ ...f, subscriptionStatus: e.target.value as NurseryFilters['subscriptionStatus'] }))}
              >
                <option value="all">{t('common.all')}</option>
                <option value="trial">{t('nurseries.status.trial')}</option>
                <option value="active">{t('nurseries.status.active')}</option>
                <option value="inactive">{t('nurseries.status.inactive')}</option>
                <option value="cancelled">{t('nurseries.status.cancelled')}</option>
                <option value="deleted">{t('nurseries.status.deleted')}</option>
                <option value="expired">{t('nurseries.status.expired', { defaultValue: 'Expired' })}</option>
              </Select>
            </FilterField>
            <FilterField label={t('xoAdmin.nurseryList.colPlan')}>
              <Select
                value={plan}
                onChange={(e) => setFilters((f) => ({ ...f, subscriptionPlan: e.target.value as NurseryFilters['subscriptionPlan'] }))}
              >
                <option value="all">{t('common.all')}</option>
                <option value="starter">{t('nurseries.plans.starter')}</option>
                <option value="professional">{t('nurseries.plans.professional')}</option>
                <option value="enterprise">{t('nurseries.plans.enterprise')}</option>
              </Select>
            </FilterField>
          </FilterBar>
        }
        pagination={isLoading || error || !sorted.length ? null : <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />}
      >
        {error ? (
          <TableEmpty
            icon="error"
            title={t('nurseries.list.error')}
            action={
              <Button type="button" variant="outline" onClick={() => void refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : isLoading ? (
          <TableLoading rows={6} />
        ) : !sorted.length ? (
          <TableEmpty
            icon="apartment"
            title={t('nurseries.empty.title')}
            description={t('nurseries.empty.subtitle')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
                <Button asChild>
                  <Link to="/xo-admin/nurseries/new">{t('nurseries.empty.cta')}</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <DataTable minWidth={960}>
            <THead>
              <Th sort={sortFor('name')}>{t('xoAdmin.nurseryList.colNursery')}</Th>
              <Th sort={sortFor('status')}>{t('xoAdmin.nurseryList.colStatus')}</Th>
              <Th>{t('xoAdmin.nurseryList.colPlan')}</Th>
              <Th align="end" sort={sortFor('children')}>{t('xoAdmin.nurseryList.colChildren')}</Th>
              <Th align="end" sort={sortFor('users')}>{t('xoAdmin.nurseryList.colUsers')}</Th>
              <Th align="end" sort={sortFor('invoices')}>{t('xoAdmin.nurseryList.colInvoices')}</Th>
              <Th sort={sortFor('created')}>{t('xoAdmin.nurseryList.colCreated')}</Th>
              <Th align="end">{t('xoAdmin.nurseryList.colActions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((n) => (
                <Tr key={n.id} onClick={() => openNurseryDashboard(n.id)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <NurseryAvatar n={n} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-on-surface">{n.name_en || n.name_ar || '—'}</p>
                        <p className="truncate text-xs text-on-surface-variant">{n.city || t('nurseries.list.cityUnknown')}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      {statusPill(n)}
                      {trialPill(n)}
                    </div>
                  </Td>
                  <Td>{planPill(n) ?? <span className="text-xs text-on-surface-variant">—</span>}</Td>
                  <Td align="end" className="tabular-nums">{n.childCount ?? 0}</Td>
                  <Td align="end" className="tabular-nums">{n.userCount ?? 0}</Td>
                  <Td align="end" className="tabular-nums">{n.invoiceCount ?? 0}</Td>
                  <Td className="whitespace-nowrap text-on-surface-variant">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </Td>
                  <Td align="end">{rowActions(n)}</Td>
                </Tr>
              ))}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}
