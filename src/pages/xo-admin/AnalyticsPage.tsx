import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePlatformAnalytics } from '@/hooks/usePlatformAnalytics';

export function AnalyticsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = usePlatformAnalytics();

  const planData = data
    ? Object.entries(data.planDistribution).map(([plan, count]) => ({
        plan,
        count,
      }))
    : [];

  const statusData = data
    ? Object.entries(data.statusDistribution).map(([status, count]) => ({
        status,
        count,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">
            {t('xoAdmin.analytics.title')}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t('xoAdmin.analytics.subtitle')}
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
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-destructive">
              {t('xoAdmin.analytics.error')}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Growth section */}
      <section aria-label={t('xoAdmin.analytics.platformGrowth')}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('xoAdmin.analytics.platformGrowth')}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading || !data ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthlySignups}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-subtle))" />
                  <XAxis dataKey="month" stroke="rgb(var(--foreground-tertiary))" />
                  <YAxis stroke="rgb(var(--foreground-tertiary))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    labelStyle={{ fontWeight: 500 }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name={t('xoAdmin.analytics.signups')}
                    stroke="rgb(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Distribution section */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card aria-label={t('xoAdmin.analytics.planDistribution')}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('xoAdmin.analytics.planDistribution')}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading || !data ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : planData.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                {t('xoAdmin.analytics.noPlanData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-subtle))" />
                  <XAxis dataKey="plan" stroke="rgb(var(--foreground-tertiary))" />
                  <YAxis stroke="rgb(var(--foreground-tertiary))" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend />
                  <Bar
                    dataKey="count"
                    name={t('xoAdmin.analytics.nurseries')}
                    fill="rgb(var(--success))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card aria-label={t('xoAdmin.analytics.statusDistribution')}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('xoAdmin.analytics.statusDistribution')}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {isLoading || !data ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : statusData.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                {t('xoAdmin.analytics.noStatusData')}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-subtle))" />
                  <XAxis dataKey="status" stroke="rgb(var(--foreground-tertiary))" />
                  <YAxis stroke="rgb(var(--foreground-tertiary))" allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend />
                  <Bar
                    dataKey="count"
                    name={t('xoAdmin.analytics.nurseries')}
                    fill="rgb(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

