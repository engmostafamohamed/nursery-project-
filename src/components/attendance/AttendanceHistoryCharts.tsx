import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { stayPoints, stayTimeDomain, weeklyBuckets, type StayPoint, type WeekBucket } from '@/lib/childAttendanceHistory';
import type { AttendanceDay } from '@/lib/attendanceApi';

// Theme tokens (index.css): the three series colours are checked for colour-blind separation on
// each theme's surface; text stays in the text colours, never the series colour.
const COLOR = {
  attended: 'rgb(var(--chart-attended))',
  withNotice: 'rgb(var(--chart-excused))',
  withoutNotice: 'rgb(var(--chart-absent))',
};
const GRID = 'rgb(var(--border-subtle))';
const SURFACE = 'rgb(var(--surface))';
const TICK = { fill: 'rgb(var(--foreground-secondary))', fontSize: 11 };

function clockLabel(minutes: number, locale: string) {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), Math.round(minutes % 60));
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function hourTick(minutes: number, locale: string) {
  return new Date(2000, 0, 1, Math.floor(minutes / 60)).toLocaleTimeString(locale, { hour: 'numeric', hour12: true });
}

function shortDate(date: string, locale: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function ChartCard({ title, subtitle, legend, children }: { title: string; subtitle: string; legend: ReactNode; children: ReactNode }) {
  return (
    <figure className="flex min-w-0 flex-col rounded-xl border border-outline-variant bg-surface shadow-sm">
      <figcaption className="border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <span className="block text-sm font-semibold text-on-surface">{title}</span>
        <span className="mt-0.5 block text-xs text-on-surface-variant">{subtitle}</span>
      </figcaption>
      <div className="h-64 px-2 pt-4">{children}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pb-4 pt-2 text-xs text-on-surface-variant">{legend}</div>
    </figure>
  );
}

function Swatch({ color, label, shape = 'square' }: { color: string; label: string; shape?: 'square' | 'ring' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={shape === 'ring' ? 'h-2.5 w-2.5 rounded-full border-2 bg-surface' : 'h-2.5 w-2.5 rounded-sm'}
        style={shape === 'ring' ? { borderColor: color } : { background: color }}
      />
      {label}
    </span>
  );
}

function TooltipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-40 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs text-on-surface shadow-md">
      <p className="mb-1 font-semibold">{title}</p>
      <div className="space-y-0.5 text-on-surface-variant">{children}</div>
    </div>
  );
}

function TooltipRow({ color, label, value }: { color?: string; label: string; value: string | number }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5">
        {color ? <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: color }} /> : null}
        {label}
      </span>
      <span className="font-semibold tabular-nums text-on-surface">{value}</span>
    </p>
  );
}

/**
 * The child's attendance in pictures: how many expected days were attended or missed each week,
 * and when the child arrived and left each day. The daily log below is the same data as a list.
 */
export function AttendanceHistoryCharts({ days }: { days: AttendanceDay[] }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === 'rtl';
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';

  const weeks = useMemo(() => weeklyBuckets(days), [days]);
  const points = useMemo(() => stayPoints(days), [days]);
  const arrivals = useMemo(() => points.filter((point) => point.arrivalOnly !== null), [points]);
  const domain = useMemo(() => stayTimeDomain(points), [points]);
  const hourTicks = useMemo(() => {
    const step = domain[1] - domain[0] > 10 * 60 ? 120 : 60;
    const ticks: number[] = [];
    for (let m = domain[0]; m <= domain[1]; m += step) ticks.push(m);
    return ticks;
  }, [domain]);
  const anyStay = points.some((point) => point.stay || point.arrivalOnly !== null);

  const seriesLabel = {
    attended: t('attendanceHistory.series.attended'),
    withNotice: t('attendanceHistory.series.withNotice'),
    withoutNotice: t('attendanceHistory.series.withoutNotice'),
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard
        title={t('attendanceHistory.charts.weeklyTitle')}
        subtitle={t('attendanceHistory.charts.weeklySubtitle')}
        legend={
          <>
            <Swatch color={COLOR.attended} label={seriesLabel.attended} />
            <Swatch color={COLOR.withNotice} label={seriesLabel.withNotice} />
            <Swatch color={COLOR.withoutNotice} label={seriesLabel.withoutNotice} />
          </>
        }
      >
        {weeks.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="weekStart"
                tickFormatter={(value: string) => shortDate(value, locale)}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                reversed={isRtl}
                minTickGap={8}
              />
              <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={28} orientation={isRtl ? 'right' : 'left'} />
              <Tooltip
                cursor={{ fill: 'rgb(var(--surface-high) / 0.6)' }}
                content={({ active, payload }) => {
                  const week = active ? (payload?.[0]?.payload as WeekBucket | undefined) : undefined;
                  if (!week) return null;
                  return (
                    <TooltipBox title={t('attendanceHistory.charts.weekOf', { date: shortDate(week.weekStart, locale) })}>
                      <TooltipRow color={COLOR.attended} label={seriesLabel.attended} value={week.attended} />
                      <TooltipRow color={COLOR.withNotice} label={seriesLabel.withNotice} value={week.withNotice} />
                      <TooltipRow color={COLOR.withoutNotice} label={seriesLabel.withoutNotice} value={week.withoutNotice} />
                    </TooltipBox>
                  );
                }}
              />
              {/* Same order every week, attended at the base; a 2px surface gap between segments. */}
              <Bar dataKey="attended" stackId="week" fill={COLOR.attended} stroke={SURFACE} strokeWidth={2} maxBarSize={36} isAnimationActive={false} />
              <Bar dataKey="withNotice" stackId="week" fill={COLOR.withNotice} stroke={SURFACE} strokeWidth={2} maxBarSize={36} isAnimationActive={false} />
              <Bar
                dataKey="withoutNotice"
                stackId="week"
                fill={COLOR.withoutNotice}
                stroke={SURFACE}
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart text={t('attendanceHistory.charts.noDays')} />
        )}
      </ChartCard>

      <ChartCard
        title={t('attendanceHistory.charts.timesTitle')}
        subtitle={t('attendanceHistory.charts.timesSubtitle')}
        legend={
          <>
            <Swatch color={COLOR.attended} label={t('attendanceHistory.charts.atNursery')} />
            {arrivals.length ? <Swatch color={COLOR.attended} shape="ring" label={t('attendanceHistory.charts.arrivedOnly')} /> : null}
          </>
        }
      >
        {anyStay ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 12, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => shortDate(value, locale)}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                reversed={isRtl}
                minTickGap={16}
              />
              {/* Morning at the top, like a day planner. */}
              <YAxis
                type="number"
                domain={domain}
                ticks={hourTicks}
                reversed
                tickFormatter={(value: number) => hourTick(value, locale)}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={44}
                orientation={isRtl ? 'right' : 'left'}
              />
              <Tooltip
                cursor={{ fill: 'rgb(var(--surface-high) / 0.6)' }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as StayPoint | undefined) : undefined;
                  if (!point) return null;
                  return (
                    <TooltipBox title={new Date(`${point.date}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}>
                      {point.stay ? (
                        <>
                          <TooltipRow label={t('attendanceHistory.log.arrival')} value={clockLabel(point.stay[0], locale)} />
                          <TooltipRow label={t('attendanceHistory.log.departure')} value={clockLabel(point.stay[1], locale)} />
                        </>
                      ) : point.arrivalOnly !== null ? (
                        <>
                          <TooltipRow label={t('attendanceHistory.log.arrival')} value={clockLabel(point.arrivalOnly, locale)} />
                          <p>{t('attendanceHistory.log.notCheckedOut')}</p>
                        </>
                      ) : (
                        <p>{t(point.status === 'excused' ? 'attendanceHistory.series.withNotice' : 'attendanceHistory.series.withoutNotice')}</p>
                      )}
                    </TooltipBox>
                  );
                }}
              />
              <Bar dataKey="stay" fill={COLOR.attended} radius={4} maxBarSize={14} isAnimationActive={false} />
              <Scatter data={arrivals} dataKey="arrivalOnly" fill={SURFACE} stroke={COLOR.attended} strokeWidth={2} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart text={t('attendanceHistory.charts.noTimes')} />
        )}
      </ChartCard>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-on-surface-variant">
      <MaterialSymbol name="bar_chart" className="text-on-surface-variant/60" />
      {text}
    </div>
  );
}
