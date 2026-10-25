// The family's attendance card on the parent dashboard: today right now, or a period's numbers
// (days attended, the rate, absences, extra hours, the usual times), each opening the days it counts
// with the exact times, filtered by child, weekday, date and state. Plain functions over the days
// get_attendance_days returns and each child's day from get_children_today.
import { minutesFromMidnight } from '@/lib/attendanceAnalytics';
import type { AttendanceDay } from '@/lib/attendanceApi';
import { historyDays, isAttended } from '@/lib/childAttendanceHistory';

/** Each child's day right now (get_children_today). */
export type ChildToday = {
  child_id: string;
  day: string;
  day_status: 'in_nursery' | 'picked_up' | 'excused' | 'absent' | 'off' | 'not_enrolled';
  check_in: string | null;
  check_out: string | null;
  pickup_due_at: string | null;
  late_now: boolean;
  extra_hours: number;
  extra_fee: number;
};

export type FamilyToday = {
  children: number;
  attended: number;
  inNursery: number;
  pickedUp: number;
  absent: number;
  withNotice: number;
  inExtraNow: number;
  extraChildren: number;
  extraHours: number;
  extraFee: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today's numbers, from each child's day right now (children not enrolled yet are left out). */
export function familyToday(rows: ChildToday[]): FamilyToday {
  const enrolled = rows.filter((row) => row.day_status !== 'not_enrolled');
  return {
    children: enrolled.length,
    attended: enrolled.filter((row) => row.day_status === 'in_nursery' || row.day_status === 'picked_up').length,
    inNursery: enrolled.filter((row) => row.day_status === 'in_nursery').length,
    pickedUp: enrolled.filter((row) => row.day_status === 'picked_up').length,
    absent: enrolled.filter((row) => row.day_status === 'absent' || row.day_status === 'excused').length,
    withNotice: enrolled.filter((row) => row.day_status === 'excused').length,
    inExtraNow: enrolled.filter((row) => row.late_now).length,
    extraChildren: enrolled.filter((row) => Number(row.extra_hours) > 0).length,
    extraHours: round2(enrolled.reduce((sum, row) => sum + Number(row.extra_hours), 0)),
    extraFee: round2(enrolled.reduce((sum, row) => sum + Number(row.extra_fee), 0)),
  };
}

export type FamilyPeriod = {
  /** Days a child was expected: attended, or absent with or without a notice. */
  expected: number;
  attended: number;
  absent: number;
  withNotice: number;
  /** Attended out of expected; null before there is any expected day. */
  ratePct: number | null;
  extraDays: number;
  extraChildren: number;
  extraHours: number;
  extraFee: number;
  /** Average arrival and departure, in minutes after midnight. */
  avgArrival: number | null;
  avgDeparture: number | null;
};

const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null);

/** A period's numbers over the days that count (see historyDays). */
export function familyPeriod(days: AttendanceDay[]): FamilyPeriod {
  const attended = days.filter(isAttended);
  const absent = days.filter((day) => day.status === 'absent').length;
  const withNotice = days.filter((day) => day.status === 'excused').length;
  const expected = attended.length + absent + withNotice;
  const extra = days.filter((day) => day.extraHours > 0);
  return {
    expected,
    attended: attended.length,
    absent,
    withNotice,
    ratePct: expected > 0 ? Math.round((attended.length / expected) * 1000) / 10 : null,
    extraDays: extra.length,
    extraChildren: new Set(extra.map((day) => day.childId)).size,
    extraHours: round2(extra.reduce((sum, day) => sum + day.extraHours, 0)),
    extraFee: round2(extra.reduce((sum, day) => sum + day.extraFee, 0)),
    avgArrival: average(attended.filter((day) => day.checkIn).map((day) => minutesFromMidnight(day.checkIn!))),
    avgDeparture: average(attended.filter((day) => day.checkOut).map((day) => minutesFromMidnight(day.checkOut!))),
  };
}

export type ParentTodayTile = 'attended' | 'in_nursery' | 'picked_up' | 'absent' | 'late_now' | 'extra_today';
export type ParentPeriodTile = 'attended' | 'rate' | 'absent' | 'extra' | 'times';
export type ParentTile = ParentTodayTile | ParentPeriodTile;

export const PARENT_TODAY_TILES: ParentTodayTile[] = ['attended', 'in_nursery', 'picked_up', 'absent', 'late_now', 'extra_today'];
export const PARENT_PERIOD_TILES: ParentPeriodTile[] = ['attended', 'rate', 'absent', 'extra', 'times'];

/** The number still chosen after switching between today and a period, if it exists there. */
export function keepParentTile(tile: ParentTile | null, today: boolean): ParentTile | null {
  const tiles: readonly ParentTile[] = today ? PARENT_TODAY_TILES : PARENT_PERIOD_TILES;
  return tile && tiles.includes(tile) ? tile : null;
}

/** The days a number counts, newest first. `lateNow` holds the children in extra hours right now. */
export function familyDaysFor(tile: ParentTile, days: AttendanceDay[], lateNow: ReadonlySet<string> = new Set()): AttendanceDay[] {
  const counted = days.filter((day) => day.status !== 'upcoming' && day.status !== 'not_enrolled' && day.status !== 'off' && day.status !== 'holiday');
  switch (tile) {
    case 'attended':
    case 'times':
      return counted.filter(isAttended);
    case 'in_nursery':
      return counted.filter((day) => day.status === 'partial');
    case 'picked_up':
      return counted.filter((day) => day.status === 'present');
    case 'absent':
      return counted.filter((day) => day.status === 'absent' || day.status === 'excused');
    case 'late_now':
      return counted.filter((day) => day.status === 'partial' && lateNow.has(day.childId));
    case 'extra':
    case 'extra_today':
      return counted.filter((day) => day.extraHours > 0);
    case 'rate':
      return counted;
  }
}

/** The period's days that count, as the child history counts them (today only once it has started). */
export function familyHistoryDays(days: AttendanceDay[], today: string): AttendanceDay[] {
  return historyDays(days, today);
}

export type FamilyDayState = 'attended' | 'absent' | 'excused' | 'extra';

export type FamilyFilters = { search: string; childId: string; weekday: 'all' | number; day: string; state: 'all' | FamilyDayState };
export const NO_FAMILY_FILTERS: FamilyFilters = { search: '', childId: 'all', weekday: 'all', day: '', state: 'all' };

export function hasFamilyFilters(filters: FamilyFilters): boolean {
  return Boolean(filters.search.trim()) || filters.childId !== 'all' || filters.weekday !== 'all' || Boolean(filters.day) || filters.state !== 'all';
}

/** The table's filters: a child (by pick, or by name or code in the search), weekday, date and state. */
export function filterFamilyDays(
  days: AttendanceDay[],
  filters: FamilyFilters,
  children: ReadonlyMap<string, { nameAr: string; nameEn: string; code: string | null }>,
): AttendanceDay[] {
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return days.filter((day) => {
    if (filters.childId !== 'all' && day.childId !== filters.childId) return false;
    if (filters.weekday !== 'all' && new Date(`${day.date}T12:00:00Z`).getUTCDay() !== filters.weekday) return false;
    if (filters.day && day.date !== filters.day) return false;
    if (filters.state === 'attended' && !isAttended(day)) return false;
    if (filters.state === 'absent' && day.status !== 'absent') return false;
    if (filters.state === 'excused' && day.status !== 'excused') return false;
    if (filters.state === 'extra' && !(day.extraHours > 0)) return false;
    if (words.length) {
      const child = children.get(day.childId);
      const haystack = [child?.nameAr, child?.nameEn, child?.code].join(' ').toLowerCase();
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

/** Newest day first; on the same day, by the time the child arrived. */
export function sortFamilyDays(days: AttendanceDay[]): AttendanceDay[] {
  return [...days].sort((a, b) => b.date.localeCompare(a.date) || (a.checkIn ?? '').localeCompare(b.checkIn ?? ''));
}
