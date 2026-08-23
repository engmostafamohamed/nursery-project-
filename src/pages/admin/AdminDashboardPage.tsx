import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { AdminDashboardActivityFeed } from '@/components/admin/AdminDashboardActivityFeed';
import { DashboardAlertsBar } from '@/components/admin/DashboardAlertsBar';
import { DashboardMiniCharts } from '@/components/admin/DashboardMiniCharts';
import { DashboardQuickActions } from '@/components/admin/DashboardQuickActions';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCard } from '@/components/ui/StatsCard';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminDashboardActivityFeed } from '@/hooks/useAdminDashboardActivityFeed';
import { useAdminDashboardAlerts } from '@/hooks/useAdminDashboardAlerts';
import { useAdminDashboardCharts } from '@/hooks/useAdminDashboardCharts';
import { useAdminDashboardEnhancedStats } from '@/hooks/useAdminDashboardEnhancedStats';
import { useAdminDashboardRealtime } from '@/hooks/useAdminDashboardRealtime';
import { useAuthSession } from '@/hooks/useAuthSession';
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
                stats?.totalChildren
                  ? `${formatInt(Math.round(stats.attendanceRatePercent), locale)}%`
                  : '—'
              }
              label={t('admin.dashboard.statAttendanceToday')}
              hint={t('admin.dashboard.statAttendanceHint', {
                present: formatInt(stats?.presentToday ?? 0, locale),
                total: formatInt(stats?.totalChildren ?? 0, locale),
              })}
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

      <section>
        <h2 className="mb-3 text-base font-semibold text-on-surface">{t('admin.dashboard.alerts.title')}</h2>
        <DashboardAlertsBar alerts={alerts} isLoading={Boolean(nurseryId) && alertsPending} basePath={adminBasePath} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm xl:col-span-7">
          <h2 className="mb-4 text-lg font-semibold">{t('admin.dashboard.recentActivity')}</h2>
          <AdminDashboardActivityFeed items={feedItems} isLoading={Boolean(nurseryId) && feedPending} />
        </div>
        <div className="xl:col-span-5">
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
