import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminDashboardActivityFeed } from '@/components/admin/AdminDashboardActivityFeed';
import { DashboardAlertsBar } from '@/components/admin/DashboardAlertsBar';
import { DashboardMiniCharts } from '@/components/admin/DashboardMiniCharts';
import { DashboardQuickActions } from '@/components/admin/DashboardQuickActions';
import { AttendanceKpiPanel } from '@/components/admin/attendance/AttendanceKpiPanel';
import { Button } from '@/components/ui/button';
import { StatusPill, TableCard } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminDashboardActivityFeed } from '@/hooks/useAdminDashboardActivityFeed';
import { useAdminDashboardAlerts } from '@/hooks/useAdminDashboardAlerts';
import { useAdminDashboardCharts } from '@/hooks/useAdminDashboardCharts';
import { useAdminDashboardEnhancedStats } from '@/hooks/useAdminDashboardEnhancedStats';
import { useAdminDashboardRealtime } from '@/hooks/useAdminDashboardRealtime';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatMoneyAmount } from '@/lib/money';

function formatInt(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB').format(n);
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-on-surface">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </span>
      {children}
    </h2>
  );
}

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const { activeNurseryId } = useActiveNurseryId();
  const nurseryId = activeNurseryId ?? profile?.nursery_id ?? undefined;
  const adminBasePath = location.pathname.startsWith('/xo-admin') ? '/xo-admin/nursery' : '/admin';
  const adminPath = (path: string) => `${adminBasePath}${path}`;
  const locale = i18n.language;

  const { data: stats, isPending: statsPending } = useAdminDashboardEnhancedStats(nurseryId);
  const { data: charts, isPending: chartsPending } = useAdminDashboardCharts(nurseryId);
  const { data: alerts, isPending: alertsPending } = useAdminDashboardAlerts(nurseryId);
  const { data: feedItems = [], isPending: feedPending } = useAdminDashboardActivityFeed(nurseryId);
  const { settings, updateSettings, isSaving: settingsSaving } = useNurserySettings(nurseryId);

  useAdminDashboardRealtime(nurseryId, queryClient);

  const showStatSkeleton = profilePending || (Boolean(nurseryId) && statsPending);

  const displayName =
    locale === 'ar'
      ? (profile?.name_ar?.trim() || profile?.name_en?.trim() || '')
      : (profile?.name_en?.trim() || profile?.name_ar?.trim() || '');
  const greetingName = displayName || t('admin.userMenu.fallbackName');
  const todayLabel = new Date().toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const trendHint =
    stats && (stats.newChildrenThisMonth > 0 || stats.newChildrenLastMonth > 0)
      ? t('admin.dashboard.statEnrollmentTrend', {
          current: stats.newChildrenThisMonth,
          previous: stats.newChildrenLastMonth,
        })
      : t('admin.dashboard.statEnrollmentTrendNone');

  // The count aggregates three queues, so send the admin to one that actually has
  // items — linking blindly to media approval lands on an empty page whenever the
  // pending work is an application or a payment.
  const pendingBreakdown = stats?.pendingBreakdown ?? { media: 0, applications: 0, payments: 0 };
  const pendingApprovalsPath =
    pendingBreakdown.applications > 0
      ? '/admissions/applications'
      : pendingBreakdown.payments > 0
        ? '/invoices'
        : '/media/approval';
  const registrationOpen = settings?.parent_registration_enabled ?? true;
  const attendanceRate = stats?.attendanceRatePercent;

  const toggleRegistration = async () => {
    try {
      await updateSettings({ parent_registration_enabled: !registrationOpen });
      toast.success(
        registrationOpen ? t('admin.dashboard.registrationClosedToast') : t('admin.dashboard.registrationOpenedToast'),
      );
    } catch {
      toast.error(t('settings.messages.saveError'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="space_dashboard"
        eyebrow={todayLabel}
        title={profilePending ? '' : t('admin.dashboard.greeting', { name: greetingName })}
        description={t('admin.dashboard.subtitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={adminPath('/attendance')}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>how_to_reg</span>
                {t('admin.dashboard.attendanceTodayAction')}
              </Link>
            </Button>
            <Button asChild>
              <Link to={adminPath('/children/enroll')}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>person_add</span>
                {t('admin.dashboard.quickActions.child')}
              </Link>
            </Button>
          </>
        }
      >
        {showStatSkeleton ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((k) => <Skeleton key={k} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              to={adminPath('/children')}
              icon="groups"
              label={t('admin.dashboard.statTotalChildren')}
              value={formatInt(stats?.totalChildren ?? 0, locale)}
              helper={trendHint}
            />
            <StatTile
              to={adminPath('/attendance')}
              icon="how_to_reg"
              label={t('admin.dashboard.statAttendanceToday')}
              value={attendanceRate != null ? `${formatInt(Math.round(attendanceRate), locale)}%` : '—'}
              tone={attendanceRate == null ? 'neutral' : attendanceRate >= 80 ? 'success' : 'warning'}
              helper={
                stats?.closedToday
                  ? t('attendance.offDayTitle')
                  : t('admin.dashboard.statAttendanceHint', {
                      present: formatInt(stats?.presentToday ?? 0, locale),
                      total: formatInt(stats?.expectedToday ?? 0, locale),
                    })
              }
            />
            <StatTile
              to={adminPath(pendingApprovalsPath)}
              icon="pending_actions"
              label={t('admin.dashboard.statPendingApprovals')}
              value={formatInt(stats?.pendingApprovals ?? 0, locale)}
              tone={(stats?.pendingApprovals ?? 0) > 0 ? 'warning' : 'success'}
              helper={t('admin.dashboard.statPendingApprovalsHint', {
                applications: formatInt(pendingBreakdown.applications, locale),
                payments: formatInt(pendingBreakdown.payments, locale),
                media: formatInt(pendingBreakdown.media, locale),
              })}
            />
            <StatTile
              to={adminPath('/invoices')}
              icon="payments"
              label={t('admin.dashboard.statRevenueMonth')}
              value={t('invoice.egpAmount', { amount: formatMoneyAmount(stats?.revenueThisMonth ?? 0) })}
              tone="success"
            />
          </div>
        )}
      </PageHeader>

      <section>
        <SectionTitle icon="notification_important">{t('admin.dashboard.alerts.title')}</SectionTitle>
        <DashboardAlertsBar alerts={alerts} isLoading={Boolean(nurseryId) && alertsPending} basePath={adminBasePath} />
      </section>

      {nurseryId ? <AttendanceKpiPanel nurseryId={nurseryId} /> : null}

      <section className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <TableCard
          title={t('admin.dashboard.recentActivity')}
          count={feedItems.length ? t('admin.dashboard.activityCount', { count: feedItems.length }) : undefined}
          className="xl:col-span-7"
        >
          <div className="max-h-[38rem] overflow-y-auto">
            <AdminDashboardActivityFeed items={feedItems} isLoading={Boolean(nurseryId) && feedPending} />
          </div>
        </TableCard>
        <div className="space-y-5 xl:col-span-5">
          <DashboardQuickActions basePath={adminBasePath} />

          <TableCard
            title={t('admin.dashboard.registrationControlTitle')}
            actions={
              <StatusPill tone={registrationOpen ? 'success' : 'error'} icon={registrationOpen ? 'lock_open' : 'lock'}>
                {registrationOpen ? t('admin.dashboard.registrationOpen') : t('admin.dashboard.registrationClosed')}
              </StatusPill>
            }
            description={registrationOpen ? t('admin.dashboard.registrationOpenHint') : t('admin.dashboard.registrationClosedHint')}
          >
            <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
              <div className="me-auto">
                <p className="text-xs text-on-surface-variant">{t('admin.dashboard.registrationApplicationsThisMonth')}</p>
                <p className="text-2xl font-bold tabular-nums text-on-surface">{formatInt(stats?.applicationsThisMonth ?? 0, locale)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost">
                  <Link to={adminPath('/settings')}>
                    <span className="material-symbols-outlined me-1 text-base" aria-hidden>tune</span>
                    {t('admin.dashboard.editRegistrationSettings')}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant={registrationOpen ? 'outline' : 'default'}
                  disabled={!nurseryId || settingsSaving}
                  onClick={() => void toggleRegistration()}
                >
                  <span className="material-symbols-outlined me-1 text-base" aria-hidden>
                    {registrationOpen ? 'visibility_off' : 'visibility'}
                  </span>
                  {registrationOpen ? t('admin.dashboard.disableRegistration') : t('admin.dashboard.enableRegistration')}
                </Button>
              </div>
            </div>
          </TableCard>
        </div>
      </section>

      <section>
        <SectionTitle icon="monitoring">{t('admin.dashboard.charts.sectionTitle')}</SectionTitle>
        <DashboardMiniCharts data={charts} isLoading={Boolean(nurseryId) && chartsPending} />
      </section>
    </div>
  );
}
