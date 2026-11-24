import { useMemo, useState } from 'react';
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
import { useNurseriesList, type XoNurseryListRow } from '@/hooks/useNurseries';
import { usePagination } from '@/hooks/usePagination';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/nursery';

type SortKey = 'name' | 'created' | 'children' | 'users' | 'invoices' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = SubscriptionStatus | 'all';
type PlanFilter = SubscriptionPlan | 'all';

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

/** A nursery's status, the same on the tiles, the filter and the table: deleted wins, none yet is a trial. */
function statusOf(n: XoNurseryListRow): SubscriptionStatus {
  return n.deleted_at ? 'deleted' : n.subscription_status ?? 'trial';
}

function nurseryInitials(n: XoNurseryListRow): string {
  const src = (n.name_en || n.name_ar || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function NurseryAvatar({ n }: { n: XoNurseryListRow }) {
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
  const [status, setStatus] = useState<StatusFilter>('all');
  const [plan, setPlan] = useState<PlanFilter>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const dateLocale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';

  // One request for every nursery; the filters below only narrow what is shown.
  const { data, isLoading, error, refetch } = useNurseriesList();

  const clearFilters = () => {
    setStatus('all');
    setPlan('all');
    setSearch('');
  };
  const filtersActive = status !== 'all' || plan !== 'all' || Boolean(search.trim());
  const toggleStatus = (value: SubscriptionStatus) => setStatus((current) => (current === value ? 'all' : value));

  const nurseries = useMemo(() => data ?? [], [data]);

  // The tiles count every nursery, whatever the filters show.
  const summary = useMemo(() => {
    const totals = { total: 0, active: 0, trial: 0, suspended: 0, cancelled: 0, deleted: 0 };
    for (const n of nurseries) {
      const value = statusOf(n);
      totals.total += 1;
      if (value === 'deleted') totals.deleted += 1;
      else if (value === 'active') totals.active += 1;
      else if (value === 'trial') totals.trial += 1;
      else if (value === 'cancelled') totals.cancelled += 1;
      else if (value === 'inactive' || n.suspended_at) totals.suspended += 1;
    }
    return totals;
  }, [nurseries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nurseries.filter(
      (n) =>
        (status === 'all' || statusOf(n) === status) &&
        (plan === 'all' || n.subscription_plan === plan) &&
        (!q || `${n.name_en ?? ''} ${n.name_ar ?? ''}`.toLowerCase().includes(q)),
    );
  }, [nurseries, status, plan, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const factor = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return ((a.name_en || a.name_ar || '').localeCompare(b.name_en || b.name_ar || '')) * factor;
        case 'children':
          return (a.child_count - b.child_count) * factor;
        case 'users':
          return (a.user_count - b.user_count) * factor;
        case 'invoices':
          return (a.invoice_count - b.invoice_count) * factor;
        case 'status':
          return statusOf(a).localeCompare(statusOf(b)) * factor;
        case 'created':
        default: {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return (ta - tb) * factor;
        }
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // The page goes back to the first one whenever a filter or the order changes.
  const pager = usePagination(sorted, 10, `${status}|${plan}|${search}|${sortKey}|${sortDir}`);

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

  const statusPill = (n: XoNurseryListRow) => {
    const value = statusOf(n);
    return <StatusPill tone={STATUS_TONE[value] ?? 'neutral'}>{t(`nurseries.status.${value}`, { defaultValue: value })}</StatusPill>;
  };

  const planPill = (n: XoNurseryListRow) =>
    n.subscription_plan ? (
      <StatusPill tone={n.subscription_plan === 'enterprise' ? 'primary' : 'neutral'} icon="workspace_premium">
        {t(`nurseries.plans.${n.subscription_plan}`, { defaultValue: n.subscription_plan })}
      </StatusPill>
    ) : null;

  const trialPill = (n: XoNurseryListRow) => {
    if (statusOf(n) !== 'trial' || !n.trial_ends_at) return null;
    const days = daysUntil(n.trial_ends_at);
    if (days === null) return null;
    const tone: PillTone = days <= 0 ? 'error' : days <= 7 ? 'warning' : 'primary';
    const label = days <= 0 ? t('xoAdmin.nurseryList.trialExpired') : t('xoAdmin.nurseryList.trialDaysLeft', { count: days });
    return <StatusPill tone={tone} icon="schedule">{label}</StatusPill>;
  };

  const rowActions = (n: XoNurseryListRow) => {
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
              <SearchInput value={search} onChange={setSearch} placeholder={t('nurseries.list.searchPlaceholder')} />
            </FilterField>
            <FilterField label={t('xoAdmin.nurseryList.colStatus')}>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
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
                onChange={(e) => setPlan(e.target.value as PlanFilter)}
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
        ) : !nurseries.length ? (
          <TableEmpty
            icon="apartment"
            title={t('nurseries.empty.title')}
            description={t('nurseries.empty.subtitle')}
            action={
              <Button asChild>
                <Link to="/xo-admin/nurseries/new">{t('nurseries.empty.cta')}</Link>
              </Button>
            }
          />
        ) : !sorted.length ? (
          <TableEmpty
            icon="filter_alt_off"
            title={t('nurseries.empty.noMatch')}
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                {t('common.clearFilters')}
              </Button>
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
                  <Td align="end" className="tabular-nums">{n.child_count}</Td>
                  <Td align="end" className="tabular-nums">{n.user_count}</Td>
                  <Td align="end" className="tabular-nums">{n.invoice_count}</Td>
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
