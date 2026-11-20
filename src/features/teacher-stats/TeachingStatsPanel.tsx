import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { TableCard } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { localName } from '@/lib/bilingualName';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_SERIES, CHART_TOOLTIP_STYLE, chartDirection } from '@/lib/chartTheme';

import { attendanceRate, biggestClass } from './teachingStats';
import { useTeachingStats } from './useTeachingStats';

/**
 * How the teacher's own classes have been going: the fortnight's figures, then attendance and the
 * day's reports as trends, and the size of each class she teaches. One call answers all of it.
 */
export function TeachingStatsPanel({ userId }: { userId: string | null | undefined }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';

  const query = useTeachingStats(userId);
  const stats = query.data;

  if (query.isPending) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !stats || !stats.classes.length) return null;

  // The plots render left to right; in Arabic time still runs right to left.
  const chart = chartDirection(i18n.dir() === 'rtl', 0);
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${day}T00:00:00`));

  const rate = attendanceRate(stats);
  const busiest = biggestClass(stats);
  const classBars = stats.classes.map((c) => ({
    name: localName(c.nameAr, c.nameEn, isAr) || '—',
    children: c.children,
  }));

  return (
    <section className="space-y-4" data-testid="teaching-stats">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon="groups" label={t('teacher.stats.tiles.children')} value={stats.totals.children} />
        <StatTile icon="school" label={t('teacher.stats.tiles.classes')} value={stats.totals.classes}
                  helper={busiest ? t('teacher.stats.tiles.busiest', { name: localName(busiest.nameAr, busiest.nameEn, isAr) }) : undefined} />
        <StatTile
          icon="how_to_reg"
          tone={rate == null ? 'neutral' : rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'error'}
          label={t('teacher.stats.tiles.attendance')}
          value={rate == null ? '—' : `${rate}%`}
          helper={t('teacher.stats.tiles.overFortnight')}
        />
        <StatTile icon="description" tone="primary" label={t('teacher.stats.tiles.reportsSent')}
                  value={stats.totals.reportsSent} helper={t('teacher.stats.tiles.overFortnight')} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TableCard title={t('teacher.stats.charts.attendance')} description={t('teacher.stats.charts.attendanceHint')}>
          <div className="h-56 p-4 sm:p-5" dir="ltr">
            {stats.attendance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.attendance} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                  <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} reversed={chart.xAxis.reversed} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} orientation={chart.yAxis.orientation} width={34} />
                  <Tooltip
                    cursor={CHART_CURSOR}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelFormatter={(v) => dayLabel(String(v))}
                    formatter={(value) => [Number(value ?? 0), t('teacher.stats.charts.here')] as [number, string]}
                  />
                  <Area type="monotone" dataKey="here" stroke={CHART_SERIES[0]} fill={CHART_SERIES[0]} fillOpacity={0.18} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('teacher.stats.charts.noDays')}</p>
            )}
          </div>
        </TableCard>

        <TableCard title={t('teacher.stats.charts.reports')} description={t('teacher.stats.charts.reportsHint')}>
          <div className="h-56 p-4 sm:p-5" dir="ltr">
            {stats.reports.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.reports} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                  <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11 }} reversed={chart.xAxis.reversed} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} orientation={chart.yAxis.orientation} width={34} />
                  <Tooltip
                    cursor={CHART_CURSOR}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelFormatter={(v) => dayLabel(String(v))}
                    formatter={(value) => [Number(value ?? 0), t('teacher.stats.charts.sent')] as [number, string]}
                  />
                  <Bar dataKey="sent" fill={CHART_SERIES[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('teacher.stats.charts.noReports')}</p>
            )}
          </div>
        </TableCard>
      </div>

      {classBars.length > 1 ? (
        <TableCard title={t('teacher.stats.charts.classes')} description={t('teacher.stats.charts.classesHint')}>
          <div className="h-52 p-4 sm:p-5" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classBars} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} orientation={chart.yAxis.orientation} />
                <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE}
                         formatter={(value) => [Number(value ?? 0), t('teacher.stats.tiles.children')] as [number, string]} />
                <Bar dataKey="children" fill={CHART_SERIES[2]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TableCard>
      ) : null}
    </section>
  );
}
