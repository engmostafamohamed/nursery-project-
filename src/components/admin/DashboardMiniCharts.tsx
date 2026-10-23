import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { TableCard } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import type { AdminDashboardCharts } from '@/hooks/useAdminDashboardCharts';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_TOOLTIP_STYLE, chartColor, chartDirection } from '@/lib/chartTheme';
import { formatMoneyAmount } from '@/lib/money';

type Props = {
  data: AdminDashboardCharts | undefined;
  isLoading: boolean;
};

/**
 * The dashboard trends: daily attendance (7 days), revenue (30 days) and children per class.
 * Each chart is one series, so it is one colour and its card title names it (no legend).
 */
export function DashboardMiniCharts({ data, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const locale = isAr ? 'ar-EG' : 'en-GB';

  if (isLoading || !data) {
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  // The plots render left to right (dir="ltr"): in Arabic, SVG tick labels anchored at "start"
  // would grow into the plot. chartDirection still runs time right to left.
  // Value axes keep their full width: pulled in, "50%" and "4.5K" lose their first characters in Arabic.
  const chart = chartDirection(i18n.dir() === 'rtl', 0);
  const revenueChart = chart;
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const primary = chartColor('primary');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const dayLabel = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, options);

  const attendance = data.attendance7.map((p) => ({ ...p, label: dayLabel(p.date, { weekday: 'short' }) }));
  const withRate = attendance.filter((p) => p.total > 0);
  const averageRate = withRate.length ? Math.round(withRate.reduce((sum, p) => sum + p.ratePercent, 0) / withRate.length) : null;

  const revenue = data.revenue30.map((p) => ({ ...p, label: dayLabel(p.date, { day: 'numeric', month: 'short' }) }));
  const revenueTotal = revenue.reduce((sum, p) => sum + p.amount, 0);

  const classes = data.enrollmentByClass.slice(0, 6);
  const maxEnroll = Math.max(1, ...classes.map((p) => p.count));
  const totalEnrolled = data.enrollmentByClass.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <TableCard
        title={t('admin.dashboard.charts.attendanceTitle')}
        count={averageRate != null ? t('admin.dashboard.charts.averageRate', { rate: averageRate }) : undefined}
        description={t('admin.dashboard.charts.attendanceHint')}
      >
        <div className="h-52 p-4 sm:p-5" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendance} margin={chart.margin}>
              <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} {...chart.xAxis} />
              <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} fontSize={11} width={40} {...chart.yAxis} />
              <Tooltip
                cursor={CHART_CURSOR}
                contentStyle={CHART_TOOLTIP_STYLE}
                wrapperStyle={{ direction: i18n.dir() }}
                formatter={(value) => [`${value}%`, t('admin.dashboard.charts.rateLabel')]}
              />
              <Bar dataKey="ratePercent" fill={primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </TableCard>

      <TableCard
        title={t('admin.dashboard.charts.revenueTitle')}
        count={money(revenueTotal)}
        description={t('admin.dashboard.charts.revenueHint')}
      >
        <div className="h-52 p-4 sm:p-5" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenue} margin={revenueChart.margin}>
              <defs>
                <linearGradient id="dashboard-revenue-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primary} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={24} {...revenueChart.xAxis} />
              <YAxis allowDecimals={false} tickFormatter={(v: number) => compact.format(v)} tickLine={false} axisLine={false} fontSize={11} width={isAr ? 60 : 40} {...revenueChart.yAxis} />
              <Tooltip
                cursor={{ stroke: CHART_GRID_STROKE }}
                contentStyle={CHART_TOOLTIP_STYLE}
                wrapperStyle={{ direction: i18n.dir() }}
                formatter={(value) => [money(Number(value)), t('admin.dashboard.charts.revenueLabel')]}
              />
              <Area type="monotone" dataKey="amount" stroke={primary} strokeWidth={2} fill="url(#dashboard-revenue-fill)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </TableCard>

      <TableCard
        title={t('admin.dashboard.charts.enrollmentTitle')}
        count={totalEnrolled ? t('admin.dashboard.charts.childrenCount', { count: totalEnrolled }) : undefined}
      >
        {classes.length ? (
          <ul className="space-y-3 p-4 sm:p-5">
            {classes.map((row) => (
              <li key={row.classId}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-on-surface">{isAr ? row.labelAr || row.labelEn : row.labelEn || row.labelAr}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-on-surface">{row.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(row.count / maxEnroll) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-on-surface-variant">{t('admin.dashboard.charts.enrollmentEmpty')}</p>
        )}
      </TableCard>
    </div>
  );
}
