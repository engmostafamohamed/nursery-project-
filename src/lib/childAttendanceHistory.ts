// A child's attendance history as the staff and the family see it: the headline numbers, the two
// charts (days attended and missed each week; arrival and departure times) and the absences with
// the family's notice. Plain functions over the days get_attendance_days returns.
import { minutesFromMidnight } from '@/lib/attendanceAnalytics';
import type { AttendanceDay } from '@/lib/attendanceApi';
import { addCalendarDaysYmd } from '@/lib/nurseryDay';

/** The periods the history can show, in days (the server allows up to 400). */
export const HISTORY_RANGES = [30, 90, 180] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/**
 * The days that belong in the history, newest first: school days and holidays from enrollment on.
 * Weekends, upcoming days and today before the child has come (or been reported absent) are left out.
 */
export function historyDays(days: AttendanceDay[], today: string): AttendanceDay[] {
  return days.filter((day) => {
    if (day.status === 'upcoming' || day.status === 'not_enrolled' || day.status === 'off') return false;
    if (day.date === today && day.status === 'absent') return false;
    return true;
  });
}

export const isAttended = (day: Pick<AttendanceDay, 'status'>) => day.status === 'present' || day.status === 'partial';

export type HistoryStats = {
  /** Days the child was expected: attended, or absent with or without notice. */
  expectedDays: number;
  attendedDays: number;
  /** Absent, and the family sent a notice. */
  withNotice: number;
  /** Absent with no notice. */
  withoutNotice: number;
  /** Attended out of expected; null before there is any expected day. */
  ratePct: number | null;
  /** Average arrival and departure, in minutes after midnight. */
  avgArrival: number | null;
  avgDeparture: number | null;
  /** Days picked up after closing time, and the extra hours they came to. */
  latePickups: number;
  extraHours: number;
};

const average = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

export function historyStats(days: AttendanceDay[]): HistoryStats {
  const attendedDays = days.filter(isAttended).length;
  const withNotice = days.filter((day) => day.status === 'excused').length;
  const withoutNotice = days.filter((day) => day.status === 'absent').length;
  const expectedDays = attendedDays + withNotice + withoutNotice;
  return {
    expectedDays,
    attendedDays,
    withNotice,
    withoutNotice,
    ratePct: expectedDays > 0 ? Math.round((attendedDays / expectedDays) * 1000) / 10 : null,
    avgArrival: average(days.filter((day) => day.checkIn).map((day) => minutesFromMidnight(day.checkIn!))),
    avgDeparture: average(days.filter((day) => day.checkOut).map((day) => minutesFromMidnight(day.checkOut!))),
    latePickups: days.filter((day) => day.extraHours > 0).length,
    extraHours: days.reduce((sum, day) => sum + day.extraHours, 0),
  };
}

export type WeekBucket = {
  /** The week's first day (Sunday), YYYY-MM-DD. */
  weekStart: string;
  attended: number;
  withNotice: number;
  withoutNotice: number;
};

/** Sunday on or before a YYYY-MM-DD date. */
export function weekStartOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addCalendarDaysYmd(date, -weekday);
}

/** Expected days counted per week, oldest week first; weeks with no expected day are left out. */
export function weeklyBuckets(days: AttendanceDay[]): WeekBucket[] {
  const weeks = new Map<string, WeekBucket>();
  for (const day of days) {
    const key = weekStartOf(day.date);
    const week = weeks.get(key) ?? { weekStart: key, attended: 0, withNotice: 0, withoutNotice: 0 };
    if (isAttended(day)) week.attended += 1;
    else if (day.status === 'excused') week.withNotice += 1;
    else if (day.status === 'absent') week.withoutNotice += 1;
    else continue;
    weeks.set(key, week);
  }
  return [...weeks.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

export type StayPoint = {
  date: string;
  status: AttendanceDay['status'];
  /** Arrival to departure, in minutes after midnight, on days the child was checked in and out. */
  stay: [number, number] | null;
  /** Arrival on a day with no check-out yet. */
  arrivalOnly: number | null;
};

/** One point per expected day, oldest first: the time the child spent at the nursery. */
export function stayPoints(days: AttendanceDay[]): StayPoint[] {
  return days
    .filter((day) => day.status !== 'holiday')
    .map((day) => {
      const arrival = day.checkIn ? minutesFromMidnight(day.checkIn) : null;
      const departure = day.checkOut ? minutesFromMidnight(day.checkOut) : null;
      return {
        date: day.date,
        status: day.status,
        stay: arrival !== null && departure !== null ? ([arrival, Math.max(arrival, departure)] as [number, number]) : null,
        arrivalOnly: arrival !== null && departure === null ? arrival : null,
      };
    })
    .reverse();
}

/** The time axis: whole hours around every arrival and departure, at least 07:00–17:00. */
export function stayTimeDomain(points: StayPoint[]): [number, number] {
  const times = points.flatMap((point) => [...(point.stay ?? []), ...(point.arrivalOnly !== null ? [point.arrivalOnly] : [])]);
  const start = Math.min(7 * 60, ...times);
  const end = Math.max(17 * 60, ...times);
  return [Math.floor(start / 60) * 60, Math.ceil(end / 60) * 60];
}

/** Absences, newest first, with the family's notice when there is one. */
export function absenceDays(days: AttendanceDay[]): AttendanceDay[] {
  return days.filter((day) => day.status === 'absent' || day.status === 'excused');
}

/** Minutes between arrival and departure, or null while the child has not left. */
export function stayMinutes(day: Pick<AttendanceDay, 'checkIn' | 'checkOut'>): number | null {
  if (!day.checkIn || !day.checkOut) return null;
  const ms = Date.parse(day.checkOut) - Date.parse(day.checkIn);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null;
}
