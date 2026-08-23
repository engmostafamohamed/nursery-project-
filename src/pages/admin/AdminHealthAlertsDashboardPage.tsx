import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDismissHealthAlert, useHealthAlerts } from '@/hooks/useHealthAlerts';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { HealthAlertItem, HealthAlertType, HealthUrgency } from '@/lib/healthAlertsCompute';
import { fetchParentUserIdsForChild, notifyParentUsers } from '@/lib/healthNotifications';
import { formatQueryError } from '@/lib/utils';

const ALL_TYPES = 'all';
const ALL_CLASSES = 'all';
const ALL_URGENCY = 'all';

export function AdminHealthAlertsDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const alertsQuery = useHealthAlerts();
  const dismiss = useDismissHealthAlert();

  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [classFilter, setClassFilter] = useState<string>(ALL_CLASSES);
  const [urgencyFilter, setUrgencyFilter] = useState<string>(ALL_URGENCY);

  const filtered = useMemo(() => {
    let rows = alertsQuery.data?.alerts ?? [];
    if (typeFilter !== ALL_TYPES) {
      rows = rows.filter((r) => r.type === typeFilter);
    }
    if (classFilter !== ALL_CLASSES) {
      rows = rows.filter((r) => r.classId === classFilter);
    }
    if (urgencyFilter !== ALL_URGENCY) {
      rows = rows.filter((r) => r.urgency === urgencyFilter);
    }
    return rows;
  }, [alertsQuery.data?.alerts, typeFilter, classFilter, urgencyFilter]);

  const childName = (a: HealthAlertItem) => {
    if (languagePref === 'ar') return a.childNameAr || a.childNameEn;
    if (languagePref === 'en') return a.childNameEn || a.childNameAr;
    return `${a.childNameAr} / ${a.childNameEn}`;
  };

  const className = (a: HealthAlertItem) => {
    if (languagePref === 'ar') return a.classNameAr || a.classNameEn;
    if (languagePref === 'en') return a.classNameEn || a.classNameAr;
    return `${a.classNameAr} / ${a.classNameEn}`;
  };

  const notifyOne = async (a: HealthAlertItem) => {
    if (!profile?.nursery_id) return;
    try {
      const ids = await fetchParentUserIdsForChild(a.childId);
      if (!ids.length) {
        toast.error(t('health.toast.error'));
        return;
      }
      await notifyParentUsers({
        nurseryId: profile.nursery_id,
        parentUserIds: ids,
        type: 'health_alert',
        titleAr: 'تنبيه صحي',
        titleEn: 'Health alert',
        bodyAr: `${t(`health.dashboard.types.${a.type}`)} — ${a.detailAr}`,
        bodyEn: `${t(`health.dashboard.types.${a.type}`)} — ${a.detailEn}`,
        actionLink: `/parent/children/${a.childId}/health`,
      });
      toast.success(t('health.toast.notifySent'));
    } catch {
      toast.error(t('health.toast.error'));
    }
  };

  const bulkNotify = async () => {
    if (!profile?.nursery_id) return;
    try {
      const seen = new Set<string>();
      const parentIds: string[] = [];
      for (const a of filtered) {
        const ids = await fetchParentUserIdsForChild(a.childId);
        for (const id of ids) {
          if (!seen.has(id)) {
            seen.add(id);
            parentIds.push(id);
          }
        }
      }
      if (!parentIds.length) {
        toast.error(t('health.toast.error'));
        return;
      }
      await notifyParentUsers({
        nurseryId: profile.nursery_id,
        parentUserIds: parentIds,
        type: 'health_alert_bulk',
        titleAr: 'تنبيهات صحية',
        titleEn: 'Health alerts',
        bodyAr: 'يرجى مراجعة ملف طفلك الصحي في التطبيق.',
        bodyEn: 'Please review your child health record in the app.',
        actionLink: '/parent/profile',
      });
      toast.success(t('health.toast.bulkSent'));
    } catch {
      toast.error(t('health.toast.error'));
    }
  };

  if (!profile?.nursery_id) {
    return (
      <EmptyState
        icon="medical_services"
        title={t('health.alertsPageTitle')}
        description={t('health.toast.error')}
      />
    );
  }

  if (alertsQuery.isLoading) return <LoadingSkeleton />;
  if (alertsQuery.isError) {
    return (
      <EmptyState
        icon="medical_services"
        title={t('health.alertsPageTitle')}
        description={formatQueryError(alertsQuery.error)}
      />
    );
  }

  const classes = alertsQuery.data?.classes ?? [];
  const alertTypes: HealthAlertType[] = [
    'medication_expired',
    'vaccination_overdue',
    'severe_allergy',
    'life_threatening_allergy',
    'missing_emergency',
    'missing_pediatrician',
  ];
  const urgencies: HealthUrgency[] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('health.alertsPageTitle')}</h1>
        <p className="text-sm text-on-surface-variant">{t('health.alertsPageDescription')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.search')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('health.dashboard.filterType')}</span>
            <select
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value={ALL_TYPES}>{t('health.dashboard.typeAll')}</option>
              {alertTypes.map((x) => (
                <option key={x} value={x}>
                  {t(`health.dashboard.types.${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('health.dashboard.filterClass')}</span>
            <select
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value={ALL_CLASSES}>{t('health.dashboard.classAll')}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {languagePref === 'ar' ? c.name_ar : languagePref === 'en' ? c.name_en : `${c.name_ar} / ${c.name_en}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('health.dashboard.sortUrgency')}</span>
            <select
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value={ALL_URGENCY}>{t('health.dashboard.sortDefault')}</option>
              {urgencies.map((u) => (
                <option key={u} value={u}>
                  {t(`health.dashboard.urgency.${u}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-1 items-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void bulkNotify()} disabled={filtered.length === 0}>
              {t('health.actions.bulkNotify')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon="check_circle" title={t('health.dashboard.empty')} description={t('health.dashboard.selectForBulk')} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-surface-container text-left">
              <tr>
                <th className="p-3 font-medium">{t('health.dashboard.columns.child')}</th>
                <th className="p-3 font-medium">{t('health.dashboard.columns.class')}</th>
                <th className="p-3 font-medium">{t('health.dashboard.columns.type')}</th>
                <th className="p-3 font-medium">{t('health.dashboard.columns.detail')}</th>
                <th className="p-3 font-medium">{t('health.dashboard.sortUrgency')}</th>
                <th className="p-3 font-medium">{t('health.dashboard.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.fingerprint} className="border-t border-outline-variant">
                  <td className="p-3">
                    <Link className="text-secondary underline" to={`/admin/children/${a.childId}/health`}>
                      {childName(a)}
                    </Link>
                  </td>
                  <td className="p-3">{a.classId ? className(a) : '—'}</td>
                  <td className="p-3">{t(`health.dashboard.types.${a.type}`)}</td>
                  <td className="p-3">{i18n.language === 'ar' ? a.detailAr : a.detailEn}</td>
                  <td className="p-3">{t(`health.dashboard.urgency.${a.urgency}`)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void notifyOne(a)}>
                        {t('health.actions.notifyParent')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={dismiss.isPending}
                        onClick={() =>
                          void dismiss.mutateAsync({ childId: a.childId, fingerprint: a.fingerprint })
                        }
                      >
                        {t('health.actions.markResolved')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
