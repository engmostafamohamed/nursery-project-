import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminDashboardActivityFeed } from '@/components/admin/AdminDashboardActivityFeed';
import { DashboardAlertsBar } from '@/components/admin/DashboardAlertsBar';
import { DashboardMiniCharts } from '@/components/admin/DashboardMiniCharts';
import { DashboardQuickActions } from '@/components/admin/DashboardQuickActions';
import { AttendanceKpiPanel } from '@/components/admin/attendance/AttendanceKpiPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCard } from '@/components/ui/StatsCard';
import { Button } from '@/components/ui/button';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminDashboardActivityFeed } from '@/hooks/useAdminDashboardActivityFeed';
import { useAdminDashboardAlerts } from '@/hooks/useAdminDashboardAlerts';
import { useAdminDashboardCharts } from '@/hooks/useAdminDashboardCharts';
import { useAdminDashboardEnhancedStats } from '@/hooks/useAdminDashboardEnhancedStats';
import { useAdminDashboardRealtime } from '@/hooks/useAdminDashboardRealtime';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { useUserProfile } from '@/hooks/useUserProfile';

function formatInt(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB').format(n);
}

function formatMoney(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  }).format(n);
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

  const toggleRegistration = async () => {
    try {
      await updateSettings({ parent_registration_enabled: !registrationOpen });
      toast.success(
        t(
          registrationOpen
            ? 'admin.dashboard.registrationClosedToast'
            : 'admin.dashboard.registrationOpenedToast',
        ),
      );
    } catch {
      toast.error(t('settings.messages.saveError'));
    }
  };

  return (
    <div className="space-y-8">
      <section>
        {profilePending ? (
          <Skeleton className="h-10 w-72 max-w-full" />
        ) : (
          <h1 className="font-headline text-3xl font-extrabold text-on-surface sm:text-4xl">
            {t('admin.dashboard.greeting', { name: greetingName })}
          </h1>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showStatSkeleton ? (
          <>
            <Skeleton className="h-40 rounded-md" />
            <Skeleton className="h-40 rounded-md" />
            <Skeleton className="h-40 rounded-md" />
            <Skeleton className="h-40 rounded-md" />
          </>
        ) : (
          <>
            <StatsCard
              to={adminPath('/children')}
              icon={<span className="material-symbols-outlined">groups</span>}
              value={formatInt(stats?.totalChildren ?? 0, locale)}
              label={t('admin.dashboard.statTotalChildren')}
              hint={trendHint}
            />
            <StatsCard
              to={adminPath('/attendance')}
              icon={<span className="material-symbols-outlined">percent</span>}
              value={
                stats?.attendanceRatePercent != null
                  ? `${formatInt(Math.round(stats.attendanceRatePercent), locale)}%`
                  : '—'
              }
              label={t('admin.dashboard.statAttendanceToday')}
              hint={
                stats?.closedToday
                  ? t('attendance.offDayTitle')
                  : t('admin.dashboard.statAttendanceHint', {
                      present: formatInt(stats?.presentToday ?? 0, locale),
                      total: formatInt(stats?.expectedToday ?? 0, locale),
                    })
              }
            />
            <StatsCard
              to={adminPath(pendingApprovalsPath)}
              icon={<span className="material-symbols-outlined">pending_actions</span>}
              value={formatInt(stats?.pendingApprovals ?? 0, locale)}
              label={t('admin.dashboard.statPendingApprovals')}
              hint={t('admin.dashboard.statPendingApprovalsHint', {
                applications: formatInt(pendingBreakdown.applications, locale),
                payments: formatInt(pendingBreakdown.payments, locale),
                media: formatInt(pendingBreakdown.media, locale),
              })}
            />
            <StatsCard
              to={adminPath('/invoices')}
              icon={<span className="material-symbols-outlined">payments</span>}
              value={formatMoney(stats?.revenueThisMonth ?? 0, locale)}
              label={t('admin.dashboard.statRevenueMonth')}
            />
          </>
        )}
      </section>

      {nurseryId ? (
        <section className="rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
          <AttendanceKpiPanel nurseryId={nurseryId} />
        </section>
      ) : null}

      <section className="rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden>app_registration</span>
              <h2 className="text-lg font-semibold text-on-surface">
                {t('admin.dashboard.registrationControlTitle')}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  registrationOpen
                    ? 'bg-success/10 text-success'
                    : 'bg-error-container text-on-error-container'
                }`}
              >
                {registrationOpen
                  ? t('admin.dashboard.registrationOpen')
                  : t('admin.dashboard.registrationClosed')}
              </span>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">
              {registrationOpen
                ? t('admin.dashboard.registrationOpenHint')
                : t('admin.dashboard.registrationClosedHint')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[34rem]">
            <div className="rounded-md border border-outline-variant bg-surface p-3">
              <p className="text-xs text-on-surface-variant">{t('admin.dashboard.registrationApplicationsThisMonth')}</p>
              <p className="mt-1 text-2xl font-black text-on-surface">
                {formatInt(stats?.applicationsThisMonth ?? 0, locale)}
              </p>
            </div>
            <Button
              type="button"
              variant={registrationOpen ? 'outline' : 'default'}
              className="min-h-16 justify-center gap-2"
              disabled={!nurseryId || settingsSaving}
              onClick={() => void toggleRegistration()}
            >
              <span className="material-symbols-outlined text-base" aria-hidden>
                {registrationOpen ? 'visibility_off' : 'visibility'}
              </span>
              {registrationOpen
                ? t('admin.dashboard.disableRegistration')
                : t('admin.dashboard.enableRegistration')}
            </Button>
            <Button asChild variant="outline" className="min-h-16 justify-center gap-2">
              <Link to={adminPath('/settings')}>
                <span className="material-symbols-outlined text-base" aria-hidden>tune</span>
                {t('admin.dashboard.editRegistrationSettings')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-on-surface">{t('admin.dashboard.alerts.title')}</h2>
        <DashboardAlertsBar alerts={alerts} isLoading={Boolean(nurseryId) && alertsPending} basePath={adminBasePath} />
      </section>

      <section className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-12">
        <div className="flex min-h-0 flex-col rounded-3xl bg-surface-container-lowest p-6 shadow-sm xl:col-span-7 xl:h-[30rem]">
          <h2 className="mb-4 text-lg font-semibold">{t('admin.dashboard.recentActivity')}</h2>
          <div className="min-h-0 flex-1">
            <AdminDashboardActivityFeed items={feedItems} isLoading={Boolean(nurseryId) && feedPending} />
          </div>
        </div>
        <div className="xl:col-span-5 xl:h-[30rem]">
          <DashboardQuickActions basePath={adminBasePath} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-on-surface">{t('admin.dashboard.charts.sectionTitle')}</h2>
        <DashboardMiniCharts data={charts} isLoading={Boolean(nurseryId) && chartsPending} />
      </section>
    </div>
  );
}
