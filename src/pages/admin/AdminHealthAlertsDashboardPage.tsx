import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { DataTable, IconAction, StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { TONE_TINT } from '@/components/ui/toneClasses';
import {
  ALERT_GROUPS,
  ALERT_LOOK,
  ALERT_TYPES,
  filterAlerts,
  groupCounts,
  isFiltered,
  NO_FILTER,
  readerName,
  URGENCIES,
  URGENCY_TONE,
  type AlertFilter,
  type AlertGroup,
} from '@/features/health-alerts/healthAlertsView';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDismissHealthAlert, useHealthAlerts } from '@/hooks/useHealthAlerts';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { HealthAlertItem, HealthAlertType, HealthUrgency } from '@/lib/healthAlertsCompute';
import { fetchParentUserIdsForChild, notifyParentUsers } from '@/lib/healthNotifications';
import { cn, formatQueryError } from '@/lib/utils';

const GROUPS: AlertGroup[] = ['allergies', 'medicines', 'vaccinations', 'contacts'];

/**
 * Health alerts: the children whose health record needs attention, most urgent first. The summary
 * at the top filters by kind; each row opens the child's health record, tells the parents, or
 * marks the alert handled.
 */
export function AdminHealthAlertsDashboardPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const navigate = useNavigate();
  const location = useLocation();
  const base = location.pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const alertsQuery = useHealthAlerts();
  const dismiss = useDismissHealthAlert();
  const [filter, setFilter] = useState<AlertFilter>(NO_FILTER);
  const [notifying, setNotifying] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const alerts = useMemo(() => alertsQuery.data?.alerts ?? [], [alertsQuery.data?.alerts]);
  const classes = alertsQuery.data?.classes ?? [];
  const counts = useMemo(() => groupCounts(alerts), [alerts]);
  const shown = useMemo(() => filterAlerts(alerts, filter), [alerts, filter]);
  const pager = usePagination(shown, 20, JSON.stringify(filter));
  const set = (patch: Partial<AlertFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const notify = async (alert: HealthAlertItem) => {
    if (!profile?.nursery_id || notifying.has(alert.fingerprint)) return;
    setNotifying((s) => new Set(s).add(alert.fingerprint));
    try {
      const ids = await fetchParentUserIdsForChild(alert.childId);
      if (!ids.length) {
        toast.error(t('health.dashboard.noParent'));
        return;
      }
      await notifyParentUsers({
        nurseryId: profile.nursery_id,
        parentUserIds: ids,
        type: 'health_alert',
        params: { kind: { i18n: `health.dashboard.types.${alert.type}` }, detail: { ar: alert.detailAr, en: alert.detailEn } },
        actionLink: `/parent/children/${alert.childId}/health`,
      });
      toast.success(t('health.toast.notifySent'));
    } catch {
      toast.error(t('health.toast.error'));
    } finally {
      setNotifying((s) => {
        const next = new Set(s);
        next.delete(alert.fingerprint);
        return next;
      });
    }
  };

  const resolve = async (alert: HealthAlertItem) => {
    const ok = await confirm({
      title: t('health.dashboard.resolveTitle'),
      description: t('health.dashboard.resolveBody', { child: readerName(alert.childNameAr, alert.childNameEn, isArabic), kind: t(`health.dashboard.types.${alert.type}`) }),
      confirmText: t('health.actions.markResolved'),
      icon: 'task_alt',
    });
    if (!ok) return;
    try {
      await dismiss.mutateAsync({ childId: alert.childId, fingerprint: alert.fingerprint });
      toast.success(t('health.dashboard.resolved'));
    } catch {
      toast.error(t('health.toast.error'));
    }
  };

  const notifyAll = async () => {
    if (!profile?.nursery_id || bulkBusy) return;
    const ok = await confirm({
      title: t('health.dashboard.bulkTitle'),
      description: t('health.dashboard.bulkBody', { count: shown.length }),
      confirmText: t('health.dashboard.bulkConfirm'),
      icon: 'campaign',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const children = [...new Set(shown.map((a) => a.childId))];
      const parentIds = [...new Set((await Promise.all(children.map((id) => fetchParentUserIdsForChild(id)))).flat())];
      if (!parentIds.length) {
        toast.error(t('health.dashboard.noParent'));
        return;
      }
      await notifyParentUsers({ nurseryId: profile.nursery_id, parentUserIds: parentIds, type: 'health_alert_bulk', actionLink: '/parent/profile' });
      toast.success(t('health.toast.bulkSent'));
    } catch {
      toast.error(t('health.toast.error'));
    } finally {
      setBulkBusy(false);
    }
  };

  if (!profile?.nursery_id && !alertsQuery.isLoading) {
    return <EmptyState icon="medical_services" title={t('health.alertsPageTitle')} description={t('health.toast.error')} />;
  }
  if (alertsQuery.isError) {
    return <EmptyState icon="medical_services" title={t('health.alertsPageTitle')} description={formatQueryError(alertsQuery.error)} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon="medical_services"
        title={t('health.alertsPageTitle')}
        description={t('health.alertsPageDescription')}
        actions={
          <Button type="button" variant="outline" onClick={() => void notifyAll()} disabled={!shown.length || bulkBusy} aria-busy={bulkBusy}>
            <MaterialSymbol name="campaign" size="text-base" className="me-1" />
            {t('health.dashboard.notifyShown', { count: shown.length })}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {GROUPS.map((group) => (
            <StatTile
              key={group}
              icon={ALERT_GROUPS[group].icon}
              tone={counts[group] ? ALERT_GROUPS[group].tone : 'success'}
              label={t(`health.dashboard.groups.${group}`)}
              value={counts[group]}
              helper={t(`health.dashboard.groupHints.${group}`)}
              active={filter.group === group}
              onClick={() => set({ group: filter.group === group ? null : group, type: 'all' })}
            />
          ))}
        </div>
      </PageHeader>

      <TableCard
        title={filter.group ? t(`health.dashboard.groups.${filter.group}`) : t('health.dashboard.allAlerts')}
        count={t('health.dashboard.count', { count: shown.length })}
        filters={
          <FilterBar onClear={() => setFilter(NO_FILTER)} canClear={isFiltered(filter)}>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={filter.search} onChange={(search) => set({ search })} placeholder={t('health.dashboard.searchChild')} />
            </FilterField>
            <FilterField label={t('health.dashboard.filterType')}>
              <Select value={filter.type} onChange={(e) => set({ type: e.target.value as HealthAlertType | 'all', group: null })}>
                <option value="all">{t('health.dashboard.typeAll')}</option>
                {ALERT_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`health.dashboard.types.${type}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('health.dashboard.filterClass')}>
              <Select value={filter.classId} onChange={(e) => set({ classId: e.target.value })}>
                <option value="all">{t('health.dashboard.classAll')}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{readerName(c.name_ar, c.name_en, isArabic)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('health.dashboard.sortUrgency')}>
              <Select value={filter.urgency} onChange={(e) => set({ urgency: e.target.value as HealthUrgency | 'all' })}>
                <option value="all">{t('health.dashboard.urgencyAll')}</option>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>{t(`health.dashboard.urgency.${u}`)}</option>
                ))}
              </Select>
            </FilterField>
          </FilterBar>
        }
        pagination={shown.length ? <TablePagination pager={pager} pageSizeOptions={[20, 50, 100]} /> : null}
      >
        {alertsQuery.isLoading ? (
          <TableLoading />
        ) : !shown.length ? (
          <TableEmpty
            icon={alerts.length ? 'filter_alt_off' : 'verified'}
            title={alerts.length ? t('health.dashboard.emptyFiltered') : t('health.dashboard.empty')}
            action={
              alerts.length ? (
                <Button type="button" variant="outline" onClick={() => setFilter(NO_FILTER)}>
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable minWidth={820}>
            <THead>
              <Th>{t('health.dashboard.columns.child')}</Th>
              <Th>{t('health.dashboard.columns.type')}</Th>
              <Th>{t('health.dashboard.columns.detail')}</Th>
              <Th>{t('health.dashboard.sortUrgency')}</Th>
              <Th align="end">{t('health.dashboard.columns.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((alert) => {
                const look = ALERT_LOOK[alert.type];
                const name = readerName(alert.childNameAr, alert.childNameEn, isArabic);
                const detail = isArabic ? alert.detailAr || alert.detailEn : alert.detailEn || alert.detailAr;
                return (
                  <Tr key={alert.fingerprint} onClick={() => navigate(`${base}/children/${alert.childId}/health`)}>
                    <Td>
                      <span className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>
                          {name.charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-on-surface">{name}</span>
                          <span className="block truncate text-xs text-on-surface-variant">
                            {alert.classId ? readerName(alert.classNameAr, alert.classNameEn, isArabic) : t('health.dashboard.noClass')}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE_TINT[look.tone])} aria-hidden>
                          <MaterialSymbol name={look.icon} size="text-lg" />
                        </span>
                        <span className="text-on-surface">{t(`health.dashboard.types.${alert.type}`)}</span>
                      </span>
                    </Td>
                    <Td className="text-on-surface-variant">{detail || '—'}</Td>
                    <Td>
                      <StatusPill tone={URGENCY_TONE[alert.urgency]}>{t(`health.dashboard.urgency.${alert.urgency}`)}</StatusPill>
                    </Td>
                    <Td align="end">
                      <span className="inline-flex items-center gap-1">
                        <IconAction
                          icon="notifications_active"
                          label={t('health.actions.notifyParent')}
                          disabled={notifying.has(alert.fingerprint)}
                          onClick={() => void notify(alert)}
                        />
                        <IconAction icon="task_alt" label={t('health.actions.markResolved')} disabled={dismiss.isPending} onClick={() => void resolve(alert)} />
                        <IconAction icon="medical_information" label={t('health.dashboard.openRecord')} to={`${base}/children/${alert.childId}/health`} />
                      </span>
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
