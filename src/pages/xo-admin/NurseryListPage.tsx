import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useNurseriesAnalytics, type NurseryFilters, type NurseryWithAnalytics } from '@/hooks/useNurseriesAnalytics';

type SortKey = 'name' | 'created' | 'children' | 'users' | 'invoices' | 'status';
type SortDir = 'asc' | 'desc';
type ViewMode = 'grid' | 'table';

function statusTone(status: string | null | undefined) {
  switch (status) {
    case 'active':
      return 'bg-success/10 text-success';
    case 'trial':
      return 'bg-info/10 text-info';
    case 'inactive':
      return 'bg-warning/10 text-warning';
    case 'cancelled':
    case 'deleted':
      return 'bg-error/10 text-error';
    case 'expired':
      return 'bg-warning/10 text-warning';
    default:
      return 'bg-surface-low text-foreground-tertiary';
  }
}

function planTone(plan: string | null | undefined) {
  switch (plan) {
    case 'enterprise':
      return 'bg-primary/10 text-primary';
    case 'professional':
      return 'bg-secondary/10 text-secondary';
    case 'starter':
      return 'bg-surface-container text-on-surface';
    default:
      return 'bg-surface-low text-foreground-tertiary';
  }
}

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
        className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-outline-variant"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary ring-1 ring-outline-variant">
      {nurseryInitials(n)}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = current === sortKey;
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant ${
        align === 'right' ? 'text-end' : 'text-start'
      }`}
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-on-surface ${isActive ? 'text-on-surface' : ''}`}
        onClick={() => onClick(sortKey)}
      >
        {label}
        <span className="material-symbols-outlined text-[14px]" aria-hidden>
          {isActive ? (dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
        </span>
      </button>
    </th>
  );
}

export function NurseryListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setActiveNurseryId } = useActiveNurseryId();
  const [filters, setFilters] = useState<NurseryFilters>({
    subscriptionStatus: 'all',
    subscriptionPlan: 'all',
    searchQuery: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  const nurseries = data ?? [];

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

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const openNurseryDashboard = (nurseryId: string) => {
    setActiveNurseryId(nurseryId);
    navigate('/xo-admin/nursery');
  };

  const renderTrialBadge = (n: NurseryWithAnalytics) => {
    if (n.subscription_status !== 'trial' || !n.trial_ends_at) return null;
    const days = daysUntil(n.trial_ends_at);
    if (days === null) return null;
    const tone = days <= 0 ? 'bg-error/10 text-error' : days <= 7 ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info';
    const label =
      days <= 0
        ? t('xoAdmin.nurseryList.trialExpired')
        : t('xoAdmin.nurseryList.trialDaysLeft', { count: days });
    return <Badge className={tone}>{label}</Badge>;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{t('nurseries.list.title')}</h1>
          <p className="text-sm text-on-surface-variant">{t('nurseries.list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isLoading}>
            <span className="material-symbols-outlined me-1 text-sm" aria-hidden>refresh</span>
            {t('common.refresh')}
          </Button>
          <Button asChild size="sm">
            <Link to="/xo-admin/nurseries/new">{t('nurseries.actions.new')}</Link>
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={t('xoAdmin.nurseryList.summaryAria')}>
        {[
          { key: 'total', label: t('xoAdmin.nurseryList.kpiTotal'), value: summary.total, icon: 'apartment', tone: 'text-primary bg-primary/10' },
          { key: 'active', label: t('xoAdmin.nurseryList.kpiActive'), value: summary.active, icon: 'check_circle', tone: 'text-success bg-success/10' },
          { key: 'trial', label: t('xoAdmin.nurseryList.kpiTrial'), value: summary.trial, icon: 'schedule', tone: 'text-info bg-info/10' },
          { key: 'suspended', label: t('xoAdmin.nurseryList.kpiSuspended'), value: summary.suspended, icon: 'pause_circle', tone: 'text-warning bg-warning/10' },
          { key: 'cancelled', label: t('xoAdmin.nurseryList.kpiCancelled'), value: summary.cancelled + summary.deleted, icon: 'cancel', tone: 'text-error bg-error/10' },
        ].map((tile) => (
          <Card key={tile.key}>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{tile.label}</p>
                <p className="mt-1 text-2xl font-semibold text-on-surface">
                  {isLoading ? '—' : tile.value}
                </p>
              </div>
              <div className={`rounded-full p-2 ${tile.tone}`}>
                <span className="material-symbols-outlined" aria-hidden>{tile.icon}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Toolbar */}
      <div className="sticky top-2 z-10 space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>search</span>
            <Input
              className="h-9 flex-1 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
              placeholder={t('nurseries.list.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={t('nurseries.list.searchPlaceholder')}
            />
          </div>
          <Select
            className="h-9 w-40 text-sm"
            value={filters.subscriptionStatus ?? 'all'}
            onChange={(e) =>
              setFilters((f) => ({ ...f, subscriptionStatus: e.target.value as NurseryFilters['subscriptionStatus'] }))
            }
            aria-label={t('nurseries.list.statusFilterPlaceholder')}
          >
            <option value="all">{t('common.all')}</option>
            <option value="trial">{t('nurseries.status.trial')}</option>
            <option value="active">{t('nurseries.status.active')}</option>
            <option value="inactive">{t('nurseries.status.inactive')}</option>
            <option value="cancelled">{t('nurseries.status.cancelled')}</option>
            <option value="deleted">{t('nurseries.status.deleted')}</option>
            <option value="expired">{t('nurseries.status.expired', { defaultValue: 'Expired' })}</option>
          </Select>
          <Select
            className="h-9 w-40 text-sm"
            value={filters.subscriptionPlan ?? 'all'}
            onChange={(e) =>
              setFilters((f) => ({ ...f, subscriptionPlan: e.target.value as NurseryFilters['subscriptionPlan'] }))
            }
            aria-label={t('nurseries.list.planFilterPlaceholder', { defaultValue: 'Filter by plan' })}
          >
            <option value="all">{t('common.all')}</option>
            <option value="starter">{t('nurseries.plans.starter')}</option>
            <option value="professional">{t('nurseries.plans.professional')}</option>
            <option value="enterprise">{t('nurseries.plans.enterprise')}</option>
          </Select>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            {t('common.clearFilters', { defaultValue: 'Clear filters' })}
          </Button>

          {/* View toggle */}
          <div className="ms-auto inline-flex overflow-hidden rounded-full border border-outline-variant bg-surface-container-lowest p-0.5">
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                view === 'grid' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden>grid_view</span>
              {t('xoAdmin.nurseryList.viewGrid')}
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                view === 'table' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'
              }`}
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden>table_rows</span>
              {t('xoAdmin.nurseryList.viewTable')}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-destructive">{t('nurseries.list.error')}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Loading */}
      {isLoading && !error ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="mt-4 h-3 w-32" />
              <Skeleton className="mt-2 h-3 w-48" />
            </Card>
          ))}
        </div>
      ) : null}

      {/* Empty */}
      {!isLoading && !error && sorted.length === 0 ? (
        <Card className="flex flex-col items-start gap-2 p-6">
          <h2 className="text-base font-semibold text-on-surface">{t('nurseries.empty.title')}</h2>
          <p className="text-sm text-on-surface-variant">{t('nurseries.empty.subtitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              {t('common.clearFilters', { defaultValue: 'Clear filters' })}
            </Button>
            <Button asChild size="sm">
              <Link to="/xo-admin/nurseries/new">{t('nurseries.empty.cta')}</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Grid */}
      {!isLoading && !error && sorted.length > 0 && view === 'grid' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((n) => (
            <Card key={n.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <NurseryAvatar n={n} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="block w-full truncate text-start text-sm font-semibold text-on-surface hover:underline"
                    title={`${n.name_ar} / ${n.name_en}`}
                    onClick={() => openNurseryDashboard(n.id)}
                  >
                    {n.name_en || n.name_ar || '—'}
                  </button>
                  <p className="truncate text-xs text-on-surface-variant" dir="rtl">
                    {n.name_ar || '—'}
                  </p>
                  <p className="mt-1 truncate text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined me-1 align-[-2px] text-[12px]" aria-hidden>place</span>
                    {n.city || t('nurseries.list.cityUnknown')}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge className={statusTone(n.deleted_at ? 'deleted' : n.subscription_status)}>
                  {t(`nurseries.status.${n.deleted_at ? 'deleted' : n.subscription_status ?? 'trial'}`)}
                </Badge>
                {n.subscription_plan ? (
                  <Badge className={planTone(n.subscription_plan)}>
                    {t(`nurseries.plans.${n.subscription_plan}`, { defaultValue: n.subscription_plan })}
                  </Badge>
                ) : null}
                {renderTrialBadge(n)}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-container/40 p-2 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.nurseryList.colChildren')}
                  </p>
                  <p className="text-sm font-semibold text-on-surface">{n.childCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.nurseryList.colUsers')}
                  </p>
                  <p className="text-sm font-semibold text-on-surface">{n.userCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.nurseryList.colInvoices')}
                  </p>
                  <p className="text-sm font-semibold text-on-surface">{n.invoiceCount ?? 0}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => openNurseryDashboard(n.id)}>
                  {t('xoAdmin.nurseryList.openDashboard')}
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/xo-admin/nurseries/${n.id}/edit`}>{t('common.edit')}</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/xo-admin/nurseries/${n.id}`}>{t('nurseries.actions.view')}</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Table */}
      {!isLoading && !error && sorted.length > 0 && view === 'table' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <thead className="border-b border-outline-variant bg-surface-container/40">
                  <tr>
                    <SortHeader label={t('xoAdmin.nurseryList.colNursery')} sortKey="name" current={sortKey} dir={sortDir} onClick={onSort} />
                    <SortHeader label={t('xoAdmin.nurseryList.colStatus')} sortKey="status" current={sortKey} dir={sortDir} onClick={onSort} />
                    <th scope="col" className="px-3 py-2 text-start text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                      {t('xoAdmin.nurseryList.colPlan')}
                    </th>
                    <SortHeader label={t('xoAdmin.nurseryList.colChildren')} sortKey="children" current={sortKey} dir={sortDir} onClick={onSort} align="right" />
                    <SortHeader label={t('xoAdmin.nurseryList.colUsers')} sortKey="users" current={sortKey} dir={sortDir} onClick={onSort} align="right" />
                    <SortHeader label={t('xoAdmin.nurseryList.colInvoices')} sortKey="invoices" current={sortKey} dir={sortDir} onClick={onSort} align="right" />
                    <SortHeader label={t('xoAdmin.nurseryList.colCreated')} sortKey="created" current={sortKey} dir={sortDir} onClick={onSort} />
                    <th scope="col" className="px-3 py-2 text-end text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                      {t('xoAdmin.nurseryList.colActions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((n) => (
                    <tr key={n.id} className="border-b border-outline-variant/60 last:border-b-0 hover:bg-surface-container/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <NurseryAvatar n={n} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="block w-full truncate text-start font-medium text-on-surface hover:underline"
                              onClick={() => openNurseryDashboard(n.id)}
                            >
                              {n.name_en || n.name_ar || '—'}
                            </button>
                            <p className="truncate text-xs text-on-surface-variant">
                              {n.city || t('nurseries.list.cityUnknown')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <Badge className={statusTone(n.deleted_at ? 'deleted' : n.subscription_status)}>
                            {t(`nurseries.status.${n.deleted_at ? 'deleted' : n.subscription_status ?? 'trial'}`)}
                          </Badge>
                          {renderTrialBadge(n)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {n.subscription_plan ? (
                          <Badge className={planTone(n.subscription_plan)}>
                            {t(`nurseries.plans.${n.subscription_plan}`, { defaultValue: n.subscription_plan })}
                          </Badge>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">{n.childCount ?? 0}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{n.userCount ?? 0}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{n.invoiceCount ?? 0}</td>
                      <td className="px-3 py-2 text-xs text-on-surface-variant">
                        {n.created_at ? new Date(n.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => openNurseryDashboard(n.id)}>
                            {t('xoAdmin.nurseryList.openDashboard')}
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/xo-admin/nurseries/${n.id}/edit`}>{t('common.edit')}</Link>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/xo-admin/nurseries/${n.id}`}>{t('nurseries.actions.view')}</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
