// A member of staff's month, day by day, as plain rules (no React, no network): which days they came
// (on time or late), were away on a reported absence, are missing (a school day gone by with no
// clocking and no absence), had off, or are still to come. The nursery's school days (its working
// days less its holidays) and its today come from the server, so a weekend or a holiday never counts
// as missing.

/** Late when they came more than this many minutes after opening (the class page's rule too). */
export const STAFF_LATE_AFTER_MINUTES = 5;

export type StaffDayState = 'on_time' | 'late' | 'away' | 'missing' | 'waiting' | 'upcoming' | 'off';
export const STAFF_DAY_STATES: StaffDayState[] = ['on_time', 'late', 'away', 'missing', 'waiting', 'upcoming', 'off'];

export type StaffDayFacts = {
  /** Their clocking that day, if any. */
  lateMinutes: number | null | undefined;
  clocked: boolean;
  /** A reported absence covers the day (not cancelled). */
  away: boolean;
  /** The nursery is open that day. */
  school: boolean;
};

export function staffDayState(date: string, today: string, f: StaffDayFacts): StaffDayState {
  if (f.clocked) return (f.lateMinutes ?? 0) > STAFF_LATE_AFTER_MINUTES ? 'late' : 'on_time';
  if (f.away) return 'away';
  if (!f.school) return 'off';
  if (date > today) return 'upcoming';
  if (date === today) return 'waiting';
  return 'missing';
}

/** The days of a month (YYYY-MM) as YYYY-MM-DD. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** Every day an absence covers, within the month. */
export function awayDays(absences: Array<{ startsOn: string; endsOn: string; cancelled: boolean }>, month: string): Set<string> {
  const days = monthDays(month);
  return new Set(days.filter((d) => absences.some((a) => !a.cancelled && a.startsOn <= d && a.endsOn >= d)));
}

export type StaffMonthSummary = Record<StaffDayState, number> & { worked: number };

/** How many days of each kind, and the days worked (on time and late). */
export function summarizeStaffMonth(states: StaffDayState[]): StaffMonthSummary {
  const s = Object.fromEntries(STAFF_DAY_STATES.map((k) => [k, 0])) as Record<StaffDayState, number>;
  for (const state of states) s[state] += 1;
  return { ...s, worked: s.on_time + s.late };
}
