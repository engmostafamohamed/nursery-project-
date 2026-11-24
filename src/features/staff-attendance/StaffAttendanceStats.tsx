import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';

import { TableCard } from '@/components/ui/DataTable';
import { ResponsiveChart } from '@/components/ui/ResponsiveChart';
import { StatTile } from '@/components/ui/StatTile';
import { localName } from '@/lib/bilingualName';
import { CHART_CURSOR, CHART_GRID_STROKE, CHART_SERIES, CHART_TOOLTIP_STYLE, chartDirection } from '@/lib/chartTheme';

import { rateTone, STATE_ICON, STATE_TILE } from './staffAttendanceLook';
import { dailyTrend, latestArrivers, punctuality, type DayState, type PersonSummary, type SpanDay } from './staffAttendanceRange';

/**
 * How the nursery's staff attendance stands over the span shown: the figures, then the span day by
 * day, and who the minutes of lateness belong to. Pressing a figure filters everything below it,
 * so a number and the rows behind it are never two separate screens.
 */
export function StaffAttendanceStats({
  days,
  summaries,
  from,
  to,
  state,
  onState,
}: {
  days: SpanDay[];
  summaries: PersonSummary[];
  from: string;
  to: string;
  state: DayState | 'all';
  onState: (next: DayState | 'all') => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const chart = chartDirection(i18n.dir() === 'rtl', 0);

  // The tiles count the whole span, never the state already picked, so pressing one is reversible.
  const counts = { on_time: 0, late: 0, still_in: 0, review: 0, away: 0, missing: 0 } as Record<DayState, number>;
  for (const day of days) counts[day.state] += 1;
  const rate = punctuality({ ...counts, all: days.length });
  const hours = Math.round(summaries.reduce((sum, s) => sum + s.hours, 0) * 10) / 10;
  const lateMinutes = summaries.reduce((sum, s) => sum + s.lateMinutes, 0);

  const trend = dailyTrend(days, from, to);
  const late = latestArrivers(summaries).map((s) => ({
    name: localName(s.person.nameAr, s.person.nameEn, isAr) || '—',
    minutes: s.lateMinutes,
  }));
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00`));

  const tiles: { key: DayState | 'punctuality' | 'hours'; label: string; value: string | number; helper?: string }[] = [
    { key: 'punctuality', label: t('staffAttendance.tiles.punctuality'), value: rate == null ? '—' : `${rate}%`, helper: t('staffAttendance.tiles.ofRecorded') },
    { key: 'on_time', label: t('staffAttendance.states.on_time'), value: counts.on_time },
    { key: 'late', label: t('staffAttendance.states.late'), value: counts.late, helper: lateMinutes > 0 ? t('staffAttendance.tiles.lateMinutes', { count: lateMinutes }) : undefined },
    { key: 'still_in', label: t('staffAttendance.states.still_in'), value: counts.still_in },
    { key: 'review', label: t('staffAttendance.states.review'), value: counts.review },
    { key: 'missing', label: t('staffAttendance.states.missing'), value: counts.missing },
    { key: 'away', label: t('staffAttendance.states.away'), value: counts.away },
    { key: 'hours', label: t('staffAttendance.tiles.hours'), value: hours, helper: t('staffAttendance.tiles.hoursHint') },
  ];

  return (
    <section className="space-y-4" data-testid="staff-attendance-stats">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {tiles.map((tile) => {
          const pickable = tile.key !== 'punctuality' && tile.key !== 'hours';
          const dayKey = pickable ? (tile.key as DayState) : null;
          return (
            <StatTile
              key={tile.key}
              icon={dayKey ? STATE_ICON[dayKey] : tile.key === 'hours' ? 'timer' : 'rule'}
              label={tile.label}
              value={tile.value}
              helper={tile.helper}
              tone={dayKey ? (counts[dayKey] > 0 ? STATE_TILE[dayKey] : 'neutral') : tile.key === 'hours' ? 'primary' : rateTone(rate)}
              onClick={dayKey ? () => onState(state === dayKey ? 'all' : dayKey) : undefined}
              active={dayKey ? state === dayKey : undefined}
            />
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TableCard title={t('staffAttendance.charts.trend')} description={t('staffAttendance.charts.trendHint')}>
          <div className="h-60 p-4 sm:p-5" dir="ltr">
            {trend.length ? (
              <ResponsiveChart>
                <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 11 }} reversed={chart.xAxis.reversed} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} orientation={chart.yAxis.orientation} width={34} />
                  <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(v) => dayLabel(String(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar stackId="d" dataKey="present" name={t('staffAttendance.charts.here')} fill={CHART_SERIES[1]} radius={[0, 0, 0, 0]} />
                  <Bar stackId="d" dataKey="away" name={t('staffAttendance.states.away')} fill={CHART_SERIES[4]} />
                  <Bar stackId="d" dataKey="missing" name={t('staffAttendance.states.missing')} fill={CHART_SERIES[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveChart>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('staffAttendance.charts.noDays')}</p>
            )}
          </div>
        </TableCard>

        <TableCard title={t('staffAttendance.charts.late')} description={t('staffAttendance.charts.lateHint')}>
          <div className="h-60 p-4 sm:p-5" dir="ltr">
            {late.length ? (
              <ResponsiveChart>
                <BarChart data={late} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} orientation={chart.yAxis.orientation} />
                  <Tooltip cursor={CHART_CURSOR} contentStyle={CHART_TOOLTIP_STYLE}
                           formatter={(value) => [Number(value ?? 0), t('staffAttendance.charts.minutes')] as [number, string]} />
                  <Bar dataKey="minutes" fill={CHART_SERIES[2]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveChart>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-on-surface-variant">{t('staffAttendance.charts.nobodyLate')}</p>
            )}
          </div>
        </TableCard>
      </div>
    </section>
  );
}
