import { Activity, Building2, CreditCard, Users } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useXoAdminStats } from '@/hooks/useXoAdminStats';

export function XoAdminHomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useXoAdminStats();
  const { setActiveNurseryId } = useActiveNurseryId();
  const nowMs = useMemo(() => Date.now(), []);

  const openNurseryDashboard = useCallback((nurseryId: string) => {
    setActiveNurseryId(nurseryId);
    navigate('/xo-admin/nursery');
  }, [navigate, setActiveNurseryId]);

  const formatRelativeDate = useCallback((iso: string) => {
    if (!iso) return '';
    const formatter = new Intl.RelativeTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en', {
      numeric: 'auto',
    });
    const created = new Date(iso);
    const diffSeconds = Math.round((nowMs - created.getTime()) / 1000);
    const diffDays = Math.round(diffSeconds / 86400);
    if (Math.abs(diffDays) < 1) {
      const diffHours = Math.round(diffSeconds / 3600);
      if (Math.abs(diffHours) < 1) {
        const diffMinutes = Math.round(diffSeconds / 60);
        return formatter.format(-diffMinutes, 'minute');
      }
      return formatter.format(-diffHours, 'hour');
    }
    return formatter.format(-diffDays, 'day');
  }, [i18n.language, nowMs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">
            {t('xoAdmin.dashboard.title')}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('xoAdmin.dashboard.subtitle')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <span className="material-symbols-outlined me-1 text-sm" aria-hidden>
            refresh
          </span>
          {t('common.refresh')}
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-surface-container-lowest">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold text-destructive">
                {t('common.error')}
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {t('xoAdmin.dashboard.errorLoading')}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Hero metrics */}
      <section aria-label={t('xoAdmin.dashboard.heroAria')}>
        {isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx}>
                <CardContent className="space-y-3 py-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.dashboard.totalNurseries')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-on-surface">
                    {data.totalNurseries}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t('xoAdmin.dashboard.activeOutOfTotal', {
                      active: data.activeNurseries,
                      total: data.totalNurseries,
                    })}
                  </p>
                </div>
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Building2 className="h-5 w-5" aria-hidden />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.dashboard.activeSubscriptions')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-on-surface">
                    {data.activeNurseries}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t('xoAdmin.dashboard.trialNurseriesLabel', {
                      count: data.trialNurseries,
                    })}
                  </p>
                </div>
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <CreditCard className="h-5 w-5" aria-hidden />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.dashboard.totalUsers')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-on-surface">
                    {data.totalUsers}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t('xoAdmin.dashboard.userBreakdown', {
                      parents: data.parentCount,
                      teachers: data.teacherCount,
                    })}
                  </p>
                </div>
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Users className="h-5 w-5" aria-hidden />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    {t('xoAdmin.dashboard.platformHealth')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-on-surface">
                    {data.activeChildren}
                  </p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {t('xoAdmin.dashboard.activeEnrollmentsLabel')}
                  </p>
                </div>
                <div className="rounded-full bg-success/10 p-2 text-success">
                  <Activity className="h-5 w-5" aria-hidden />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* Recent activity + quick stats */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card aria-label={t('xoAdmin.dashboard.recentSignups')}>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">
              {t('xoAdmin.dashboard.recentSignups')}
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <a href="/xo-admin/nurseries" className="text-xs">
                {t('xoAdmin.dashboard.viewAllNurseries')}
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading || !data ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : data.recentNurseries.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                {t('xoAdmin.dashboard.noRecentSignups')}
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recentNurseries.slice(0, 5).map((n) => (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/80 bg-surface-container px-3 py-2 transition-colors hover:border-primary hover:bg-primary-container/20"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-start"
                      onClick={() => openNurseryDashboard(n.id)}
                    >
                      <p className="text-sm font-medium text-on-surface">
                        {n.name_ar} / {n.name_en}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {formatRelativeDate(n.created_at)}
                      </p>
                    </button>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="capitalize">
                        {n.subscription_plan ?? t('xoAdmin.dashboard.planUnknown')}
                      </Badge>
                      <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                        {n.subscription_status ?? '—'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card aria-label={t('xoAdmin.dashboard.quickStats')}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('xoAdmin.dashboard.quickStats')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !data ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">
                    {t('xoAdmin.dashboard.pendingInquiries')}
                  </span>
                  <span className="font-medium text-on-surface">
                    {data.newInquiries}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">
                    {t('xoAdmin.dashboard.pendingApplications')}
                  </span>
                  <span className="font-medium text-on-surface">
                    {data.pendingApplications}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">
                    {t('xoAdmin.dashboard.overdueInvoices')}
                  </span>
                  <span
                    className={data.overdueInvoices > 0 ? 'font-semibold text-destructive' : 'font-medium text-on-surface'}
                  >
                    {data.overdueInvoices}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Plan distribution */}
      <section>
        <Card aria-label={t('xoAdmin.dashboard.nurseriesByPlan')}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('xoAdmin.dashboard.nurseriesByPlan')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : Object.keys(data.tierCounts).length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                {t('xoAdmin.dashboard.noPlanData')}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(data.tierCounts).map(([plan, count]) => (
                  <div
                    key={plan}
                    className="rounded-xl border border-outline-variant bg-surface-container px-3 py-2 text-sm"
                  >
                    <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                      {plan}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-on-surface">
                      {count}
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      {t('xoAdmin.dashboard.planCardLabel')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
