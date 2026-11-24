import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';

import { TableCard } from '@/components/ui/DataTable';
import { ResponsiveChart } from '@/components/ui/ResponsiveChart';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_SERIES, CHART_TOOLTIP_STYLE, chartDirection } from '@/lib/chartTheme';

import { arrivalHistogram, busiestHour, classBreakdown, type DayRow } from './attendanceDay';

/**
 * The day shown, drawn: how each class stands, and the hours the children arrived in. Both read the
 * rows the table above already holds, so there is nothing more to load and nothing to disagree
 * with. The weeks and months behind the day are the analytics tab's question, not this one's.
 */
export function AttendanceDayCharts({
  rows,
  timezone,
  classNameById,
}: {
  rows: DayRow[];
  timezone: string;
  classNameById: Map<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const chart = chartDirection(i18n.dir() === 'rtl', 0);

  const classes = classBreakdown(rows, (id) => classNameById.get(id) ?? '', t('classEditor.picker.noClass'));
  const arrivals = arrivalHistogram(rows, timezone);
  const busiest = busiestHour(arrivals);

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-testid="attendance-day-charts">
      <TableCard title={t('admin.attendance.dayCharts.byClass')} description={t('admin.attendance.dayCharts.byClassHint')}>
        <div className="h-60 p-4 sm:p-5" dir="ltr">
          {classes.length ? (
            <ResponsiveChart>
              <BarChart data={classes} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} orientation={chart.yAxis.orientation} />
                <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar stackId="c" dataKey="here" name={t('admin.attendanceAnalytics.present')} fill={CHART_SERIES[1]} />
                <Bar stackId="c" dataKey="excused" name={t('attendance.sections.excused')} fill={CHART_SERIES[4]} />
                <Bar stackId="c" dataKey="absent" name={t('attendance.sections.absent')} fill={CHART_SERIES[3]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveChart>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('admin.attendance.dayCharts.noClasses')}</p>
          )}
        </div>
      </TableCard>

      <TableCard
        title={t('admin.attendance.dayCharts.arrivals')}
        description={busiest && busiest.count > 0
          ? `${t('admin.attendance.dayCharts.arrivalsHint')} · ${busiest.label} — ${busiest.count} ${t('admin.attendance.dayCharts.children')}`
          : t('admin.attendance.dayCharts.arrivalsHint')}
      >
        <div className="h-60 p-4 sm:p-5" dir="ltr">
          {arrivals.length ? (
            <ResponsiveChart>
              <BarChart data={arrivals} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} reversed={chart.xAxis.reversed} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} orientation={chart.yAxis.orientation} width={34} />
                <Tooltip
                  cursor={CHART_CURSOR}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value) => [Number(value ?? 0), t('admin.attendance.dayCharts.children')] as [number, string]}
                />
                <Bar dataKey="count" fill={CHART_SERIES[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveChart>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('admin.attendance.dayCharts.noArrivals')}</p>
          )}
        </div>
      </TableCard>
    </div>
  );
}
