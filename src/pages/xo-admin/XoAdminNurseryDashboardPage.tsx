import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { AdminDashboardActivityFeed } from '@/components/admin/AdminDashboardActivityFeed';
import { DashboardAlertsBar } from '@/components/admin/DashboardAlertsBar';
import { DashboardMiniCharts } from '@/components/admin/DashboardMiniCharts';
import { DashboardQuickActions } from '@/components/admin/DashboardQuickActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCard } from '@/components/ui/StatsCard';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAdminDashboardActivityFeed } from '@/hooks/useAdminDashboardActivityFeed';
import { useAdminDashboardAlerts } from '@/hooks/useAdminDashboardAlerts';
import { useAdminDashboardCharts } from '@/hooks/useAdminDashboardCharts';
import { useAdminDashboardEnhancedStats } from '@/hooks/useAdminDashboardEnhancedStats';
import { useAdminDashboardRealtime } from '@/hooks/useAdminDashboardRealtime';

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

export function XoAdminNurseryDashboardPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { activeNurseryId, isLoading: isNurserySelectionLoading } = useActiveNurseryId();
  const locale = i18n.language;
  const nurseryId = activeNurseryId ?? undefined;
  const nurseryBasePath = '/xo-admin/nursery';
  const nurseryPath = (path: string) => `${nurseryBasePath}${path}`;

  const { data: nurseryStats, isPending: nurseryStatsPending } =
    useAdminDashboardEnhancedStats(nurseryId);
  const { data: nurseryCharts, isPending: nurseryChartsPending } =
    useAdminDashboardCharts(nurseryId);
  const { data: nurseryAlerts, isPending: nurseryAlertsPending } =
    useAdminDashboardAlerts(nurseryId);
  const { data: nurseryFeedItems = [], isPending: nurseryFeedPending } =
    useAdminDashboardActivityFeed(nurseryId);

  useAdminDashboardRealtime(nurseryId, queryClient);

  const nurseryMetricsLoading =
    isNurserySelectionLoading || (Boolean(nurseryId) && nurseryStatsPending);

  const nurseryTrendHint =
    nurseryStats && (nurseryStats.newChildrenThisMonth > 0 || nurseryStats.newChildrenLastMonth > 0)
      ? t('admin.dashboard.statEnrollmentTrend', {
          current: nurseryStats.newChildrenThisMonth,
          previous: nurseryStats.newChildrenLastMonth,
        })
      : t('admin.dashboard.statEnrollmentTrendNone');

  return (
    <div className="space-y-6">
      <div>
        <div>
          <div className="mb-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/xo-admin">
                <span className="material-symbols-outlined me-1 text-sm rtl:rotate-180" aria-hidden>
                  arrow_back
                </span>
                {t('xoAdmin.dashboard.backToPlatform')}
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold text-on-surface">
            {t('xoAdmin.dashboard.selectedNurseryTitle')}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('xoAdmin.dashboard.selectedNurserySubtitle')}
          </p>
        </div>
      </div>

      {!nurseryId && !isNurserySelectionLoading ? (
        <Card>
          <CardContent className="py-5 text-sm text-on-surface-variant">
            {t('xoAdmin.dashboard.selectedNurseryEmpty')}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {nurseryMetricsLoading ? (
              <>
                <Skeleton className="h-40 rounded-md" />
                <Skeleton className="h-40 rounded-md" />
                <Skeleton className="h-40 rounded-md" />
                <Skeleton className="h-40 rounded-md" />
              </>
            ) : (
              <>
                <StatsCard
                  to={nurseryPath('/children')}
                  icon={<span className="material-symbols-outlined">groups</span>}
                  value={formatInt(nurseryStats?.totalChildren ?? 0, locale)}
                  label={t('admin.dashboard.statTotalChildren')}
                  hint={nurseryTrendHint}
                />
                <StatsCard
                  to={nurseryPath('/attendance')}
                  icon={<span className="material-symbols-outlined">percent</span>}
                  value={
                    nurseryStats?.totalChildren
                      ? `${formatInt(Math.round(nurseryStats.attendanceRatePercent), locale)}%`
                      : '-'
                  }
                  label={t('admin.dashboard.statAttendanceToday')}
                  hint={t('admin.dashboard.statAttendanceHint', {
                    present: formatInt(nurseryStats?.presentToday ?? 0, locale),
                    total: formatInt(nurseryStats?.totalChildren ?? 0, locale),
                  })}
                />
                <StatsCard
                  to={nurseryPath('/media/approval')}
                  icon={<span className="material-symbols-outlined">pending_actions</span>}
                  value={formatInt(nurseryStats?.pendingApprovals ?? 0, locale)}
                  label={t('admin.dashboard.statPendingApprovals')}
                />
                <StatsCard
                  to={nurseryPath('/invoices')}
                  icon={<span className="material-symbols-outlined">payments</span>}
                  value={formatMoney(nurseryStats?.revenueThisMonth ?? 0, locale)}
                  label={t('admin.dashboard.statRevenueMonth')}
                />
              </>
            )}
          </div>

          <section>
            <h2 className="mb-3 text-base font-semibold text-on-surface">
              {t('admin.dashboard.alerts.title')}
            </h2>
            <DashboardAlertsBar
              alerts={nurseryAlerts}
              isLoading={Boolean(nurseryId) && nurseryAlertsPending}
              basePath={nurseryBasePath}
            />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="rounded-3xl bg-surface-container-lowest p-6 shadow-sm xl:col-span-7">
              <h2 className="mb-4 text-lg font-semibold text-on-surface">
                {t('admin.dashboard.recentActivity')}
              </h2>
              <AdminDashboardActivityFeed
                items={nurseryFeedItems}
                isLoading={Boolean(nurseryId) && nurseryFeedPending}
              />
            </div>
            <div className="xl:col-span-5">
              <DashboardQuickActions basePath={nurseryBasePath} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-on-surface">
              {t('admin.dashboard.charts.sectionTitle')}
            </h2>
            <DashboardMiniCharts
              data={nurseryCharts}
              isLoading={Boolean(nurseryId) && nurseryChartsPending}
            />
          </section>
        </>
      )}
    </div>
  );
}
