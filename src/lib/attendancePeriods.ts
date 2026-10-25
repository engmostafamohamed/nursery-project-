// The periods the dashboard's attendance card can show: today (live), a calendar month, quarter,
// half year or year (the current one, or stepping back from it), or dates the admin picks.

/** A card's period: today (live), all time, a calendar month / quarter / half year / year, or picked dates. */
export type PeriodChoice = 'today' | 'all' | 'month' | 'quarter' | 'half' | 'year' | 'custom';
export type KpiPeriod = Exclude<PeriodChoice, 'all'>;
export type CalendarPeriod = Exclude<PeriodChoice, 'today' | 'all' | 'custom'>;
export type DateRange = { from: string; to: string };

export const KPI_PERIODS: KpiPeriod[] = ['today', 'month', 'quarter', 'half', 'year', 'custom'];
/** The packages card counts all time by default, and has no live "today". */
export const ALL_TIME_PERIODS: PeriodChoice[] = ['all', 'month', 'quarter', 'half', 'year', 'custom'];

export function isCalendarPeriod(choice: PeriodChoice): choice is CalendarPeriod {
  return choice === 'month' || choice === 'quarter' || choice === 'half' || choice === 'year';
}

/** get_attendance_period_kpis reads at most this many days at a time (a leap year). */
export const MAX_KPI_RANGE_DAYS = 366;

const MONTHS: Record<CalendarPeriod, number> = { month: 1, quarter: 3, half: 6, year: 12 };

/** YYYY-MM-DD of a day; month and day may overflow either way (day 0 is the previous month's last). */
function isoDay(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** Days from `from` to `to`, both included. */
export function daysInRange({ from, to }: DateRange): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

/**
 * The calendar period holding `today` (YYYY-MM-DD), or `offset` periods before it (-1 is the
 * previous one). `to` is the period's last day even while it is still to come; the server stops
 * counting at today.
 */
export function calendarPeriodRange(period: CalendarPeriod, offset: number, today: string): DateRange {
  const length = MONTHS[period];
  const [year, month] = today.split('-').map(Number);
  const start = Math.floor((month - 1) / length) * length + offset * length;
  return { from: isoDay(year, start, 1), to: isoDay(year, start + length, 0) };
}

/** The range as counted: it ends today at the latest. */
export function clipToToday(range: DateRange, today: string): DateRange {
  return range.to > today ? { from: range.from, to: today } : range;
}

export type CustomRangeErrors = {
  from?: 'required';
  to?: 'required' | 'fromAfterTo' | 'rangeTooLong';
};

/** What is wrong with the picked dates, per field (nothing when they can be shown). */
export function customRangeErrors({ from, to }: DateRange): CustomRangeErrors {
  const errors: CustomRangeErrors = {};
  if (!from) errors.from = 'required';
  if (!to) errors.to = 'required';
  else if (from && from > to) errors.to = 'fromAfterTo';
  else if (from && daysInRange({ from, to }) > MAX_KPI_RANGE_DAYS) errors.to = 'rangeTooLong';
  return errors;
}

const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** The navigator's name for a calendar period: "October 2026", "Oct – Dec 2026", "2026". */
export function calendarPeriodLabel(period: CalendarPeriod, range: DateRange, locale: string): string {
  if (period === 'month') {
    return utcDate(range.from).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  if (period === 'year') {
    return utcDate(range.from).toLocaleDateString(locale, { year: 'numeric', timeZone: 'UTC' });
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(utcDate(range.from), utcDate(range.to));
}

/** The days a card counts: "Sunday 25 October" for one day, else "1 – 25 Oct 2026". */
export function rangeLabel(range: DateRange, locale: string): string {
  if (range.from === range.to) {
    return utcDate(range.from).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  }
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(
    utcDate(range.from),
    utcDate(range.to),
  );
}
