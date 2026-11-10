import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatTile } from '@/components/ui/StatTile';
import type { Absence } from '@/features/staff-absence/staffAbsence';
import type { StaffMonth } from '@/hooks/useStaffAttendanceMonth';
import { activeLocale } from '@/lib/datetime';
import { awayDays, monthDays, STAFF_DAY_STATES, staffDayState, summarizeStaffMonth, type StaffDayState } from '@/lib/staffMonth';
import { cn } from '@/lib/utils';

/** One look per kind of day, the same in the calendar and its key. */
const DAY_LOOK: Record<StaffDayState, { cell: string; dot: string; icon?: string }> = {
  on_time: { cell: 'border-success/40 bg-success/10 text-success', dot: 'bg-success' },
  late: { cell: 'border-warning/50 bg-warning/10 text-warning', dot: 'bg-warning', icon: 'schedule' },
  away: { cell: 'border-primary/30 bg-primary/5 text-primary', dot: 'bg-primary', icon: 'event_busy' },
  missing: { cell: 'border-error/40 bg-error/5 text-error', dot: 'bg-error', icon: 'help' },
  waiting: { cell: 'border-outline-variant bg-surface text-on-surface', dot: 'bg-outline' },
  upcoming: { cell: 'border-outline-variant/60 bg-surface text-on-surface-variant', dot: 'bg-outline-variant' },
  off: { cell: 'border-transparent bg-surface-container/40 text-on-surface-variant/60', dot: 'bg-surface-high' },
};

// A known Saturday: the week starts on Saturday, as in Egypt.
const SATURDAY = Date.UTC(2026, 0, 3);

/**
 * A member of staff's month as a calendar: each day on time, late, away on a reported absence,
 * missing (a school day gone by with no clocking and no absence), off (the nursery is closed) or still
 * to come; with the month's numbers above it and a key under it. School days come from the nursery
 * (its working days less its holidays), so a weekend or holiday never counts as missing.
 */
export function StaffAttendanceCalendar({ month, onMonthChange, data, absences }: {
  month: string;
  onMonthChange: (month: string) => void;
  data: StaffMonth | undefined;
  absences: Absence[];
}) {
  const { t } = useTranslation();
  const locale = activeLocale();

  const { cells, summary } = useMemo(() => {
    const today = data?.today ?? '';
    const school = new Set(data?.schoolDays ?? []);
    const byDay = new Map((data?.days ?? []).map((d) => [d.work_date, d]));
    const away = awayDays(absences, month);
    const days = monthDays(month).map((date) => {
      const row = byDay.get(date);
      const state = staffDayState(date, today, {
        clocked: Boolean(row?.check_in_at),
        lateMinutes: row?.late_minutes,
        away: away.has(date),
        school: school.has(date),
      });
      return { date, state, isToday: date === today };
    });
    return { cells: days, summary: summarizeStaffMonth(days.map((d) => d.state)) };
  }, [data, absences, month]);

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(SATURDAY + i * 86_400_000).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })),
    [locale],
  );
  // Blank cells before the 1st, for a week that starts on Saturday.
  const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 1) % 7;

  return (
    <section className="space-y-4" data-testid="staff-calendar">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField id="staff-month" label={t('staff.attendance.month')} className="w-full sm:w-56">
          <Input id="staff-month" type="month" value={month} onChange={(e) => e.target.value && onMonthChange(e.target.value)} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="how_to_reg" label={t('staff.attendance.stat.worked')} value={summary.worked} tone="success" />
        <StatTile icon="schedule" label={t('staff.attendance.stat.late')} value={summary.late} tone={summary.late ? 'warning' : 'success'} />
        <StatTile icon="event_busy" label={t('staff.attendance.stat.away')} value={summary.away} tone="primary" />
        <StatTile
          icon="help"
          label={t('staff.attendance.stat.missing')}
          value={summary.missing}
          helper={t('staff.attendance.stat.missingHint')}
          tone={summary.missing ? 'error' : 'success'}
        />
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface p-3 shadow-sm sm:p-4">
        <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-on-surface-variant">
          {weekdays.map((w) => <span key={w}>{w}</span>)}
        </div>
        <ol className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }, (_, i) => <li key={`blank-${i}`} aria-hidden />)}
          {cells.map((c) => {
            const look = DAY_LOOK[c.state];
            return (
              <li
                key={c.date}
                className={cn(
                  'flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm tabular-nums sm:h-14',
                  look.cell,
                  c.isToday && 'ring-2 ring-primary ring-offset-1 ring-offset-surface',
                )}
                title={t(`staff.attendance.states.${c.state}`)}
                data-state={c.state}
              >
                <span className="font-semibold">{Number(c.date.slice(8))}</span>
                {look.icon ? <MaterialSymbol name={look.icon} size="text-xs" /> : null}
                <span className="sr-only">{t(`staff.attendance.states.${c.state}`)}</span>
              </li>
            );
          })}
        </ol>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
          {STAFF_DAY_STATES.map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', DAY_LOOK[state].dot)} aria-hidden />
              {t(`staff.attendance.states.${state}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
