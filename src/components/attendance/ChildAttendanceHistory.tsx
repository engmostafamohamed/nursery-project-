import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useChildAttendanceHistory } from '@/hooks/useChildAttendanceHistory';
import { averageMinutesToTimeLabel } from '@/lib/attendanceAnalytics';
import type { AttendanceDay } from '@/lib/attendanceApi';
import { HISTORY_RANGES, historyDays, historyStats, type HistoryRange } from '@/lib/childAttendanceHistory';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';

import { AttendanceHistoryCharts } from './AttendanceHistoryCharts';
import { AttendanceAbsencesList, AttendanceDayLog } from './AttendanceHistoryLog';

type Props = {
  childId: string;
  nurseryId: string | null | undefined;
  /** Staff also see the days flagged for review. */
  audience: 'staff' | 'parent';
};

function StatTile({ icon, label, value, hint, tone }: { icon: string; label: string; value: string | number; hint?: string; tone: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-3 shadow-sm sm:p-4">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tone)}>
          <MaterialSymbol name={icon} size="text-xl" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-on-surface-variant">{label}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-on-surface">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-on-surface-variant">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A child's attendance history, the same for the nursery staff and the family: the headline
 * numbers, the charts, every absence with the family's notice, and the day-by-day log of who
 * brought and picked up the child.
 */
export function ChildAttendanceHistory({ childId, nurseryId, audience }: Props) {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<HistoryRange>(30);
  // The nursery's calendar day; read once, a lazy initial state keeps render pure.
  const [today] = useState(() => getNurseryCalendarDateString());
  const report = useChildAttendanceHistory({ childId, nurseryId: nurseryId ?? undefined, days: range });

  const days = useMemo(
    () =>
      historyDays(
        report.rows.map((row) => row.detail).filter((day): day is AttendanceDay => day !== null),
        today,
      ),
    [report.rows, today],
  );
  const stats = useMemo(() => historyStats(days), [days]);
  const clock = (minutes: number | null) => averageMinutesToTimeLabel(minutes, i18n.language);

  const rangeLabel: Record<HistoryRange, string> = {
    30: t('attendanceHistory.range.days30'),
    90: t('attendanceHistory.range.days90'),
    180: t('attendanceHistory.range.days180'),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-on-surface-variant">
          {audience === 'parent' ? t('attendanceHistory.introParent') : t('attendanceHistory.introStaff')}
        </p>
        <div role="radiogroup" aria-label={t('attendanceHistory.range.label')} className="inline-flex rounded-xl border border-outline-variant bg-surface p-1">
          {HISTORY_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={range === value}
              onClick={() => setRange(value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                range === value ? 'bg-primary text-primary-foreground' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {rangeLabel[value]}
            </button>
          ))}
        </div>
      </div>

      {report.isPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : report.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-on-surface">
          <span className="flex items-center gap-2">
            <MaterialSymbol name="error" className="text-error" />
            {t('attendanceHistory.loadError')}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void report.refetch()}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      ) : !report.child ? (
        <p className="rounded-xl border border-outline-variant bg-surface p-4 text-sm text-on-surface-variant">{t('attendanceHistory.unavailable')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <StatTile
              icon="monitoring"
              tone="bg-primary/10 text-primary"
              label={t('attendanceHistory.stats.rate')}
              value={stats.ratePct === null ? '—' : `${stats.ratePct}%`}
              hint={t('attendanceHistory.stats.rateHint', { attended: stats.attendedDays, expected: stats.expectedDays })}
            />
            <StatTile icon="event_available" tone="bg-success/10 text-success" label={t('attendanceHistory.stats.attended')} value={stats.attendedDays} />
            <StatTile icon="mark_email_read" tone="bg-warning/10 text-warning" label={t('attendanceHistory.series.withNotice')} value={stats.withNotice} />
            <StatTile
              icon="event_busy"
              tone={stats.withoutNotice > 0 ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'}
              label={t('attendanceHistory.series.withoutNotice')}
              value={stats.withoutNotice}
            />
            <StatTile
              icon="schedule"
              tone="bg-primary/10 text-primary"
              label={t('attendanceHistory.stats.usualHours')}
              value={stats.avgArrival === null ? '—' : clock(stats.avgArrival)}
              hint={stats.avgDeparture === null ? undefined : t('attendanceHistory.stats.usualDeparture', { time: clock(stats.avgDeparture) })}
            />
            <StatTile
              icon="more_time"
              tone={stats.latePickups > 0 ? 'bg-warning/10 text-warning' : 'bg-surface-container text-on-surface-variant'}
              label={t('attendanceHistory.stats.latePickups')}
              value={stats.latePickups}
              hint={stats.extraHours > 0 ? t('attendance.extraHoursShort', { hours: stats.extraHours }) : undefined}
            />
          </div>

          <AttendanceHistoryCharts days={days} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:items-start">
            <AttendanceAbsencesList days={days} />
            <AttendanceDayLog days={days} showReview={audience === 'staff'} />
          </div>
        </>
      )}
    </div>
  );
}
