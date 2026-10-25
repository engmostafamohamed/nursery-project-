// The details behind each number of the dashboard's attendance card: which numbers the card shows
// for today and for a period, which rows each one lists (the same rule the number counts), and
// where a child's row leads.
import { addCalendarDaysYmd } from '@/lib/nurseryDay';

import { daysInRange, type DateRange } from './attendancePeriods';

/** Today's numbers, live. */
export type TodayTile = 'attended' | 'in_nursery' | 'picked_up' | 'absent' | 'excused' | 'late_now' | 'extra_today';
/** A period's numbers. */
export type PeriodTile = 'attended' | 'rate' | 'late' | 'billed' | 'collected' | 'outstanding' | 'review';
export type KpiTile = TodayTile | PeriodTile;

export const TODAY_TILES: TodayTile[] = ['attended', 'in_nursery', 'picked_up', 'absent', 'excused', 'late_now', 'extra_today'];
export const PERIOD_TILES: PeriodTile[] = ['attended', 'rate', 'late', 'billed', 'collected', 'outstanding', 'review'];

/** The tile still chosen after the card switches between today and a period, if it exists there. */
export function keepTile(tile: KpiTile | null, tiles: readonly KpiTile[]): KpiTile | null {
  return tile && tiles.includes(tile) ? tile : null;
}

/** A child's day (get_attendance_day_children). */
export type DayChildRow = {
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  /** The child's unique code (CH-2026-00012). */
  child_code: string | null;
  class_id: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  parent_name_ar: string | null;
  parent_name_en: string | null;
  parent_phone: string | null;
  father_name_ar: string | null;
  father_name_en: string | null;
  /** Every parent's name and phone, to search on. */
  parents_text: string | null;
  day_status: 'in_nursery' | 'picked_up' | 'excused' | 'absent' | 'off';
  check_in: string | null;
  check_out: string | null;
  check_in_method: string | null;
  check_out_method: string | null;
  dropoff_name_ar: string | null;
  dropoff_name_en: string | null;
  dropoff_relationship: string | null;
  pickup_person_name: string | null;
  pickup_relationship: string | null;
  checked_in_by_ar: string | null;
  checked_in_by_en: string | null;
  checked_out_by_ar: string | null;
  checked_out_by_en: string | null;
  pickup_due_at: string | null;
  late_now: boolean;
  late_minutes: number;
  extra_hours: number;
  extra_hours_covered: number;
  extra_hours_billed: number;
  extra_fee: number;
  invoice_status: string | null;
  absence_reason: string | null;
  absence_note: string | null;
  absence_reported_by_ar: string | null;
  absence_reported_by_en: string | null;
  absence_reported_at: string | null;
  needs_review: boolean;
  review_reason: string | null;
};

/** A child's period (get_attendance_period_children). */
export type PeriodChildRow = {
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  /** The child's unique code (CH-2026-00012). */
  child_code: string | null;
  class_id: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  father_name_ar: string | null;
  father_name_en: string | null;
  /** Every parent's name and phone, to search on. */
  parents_text: string | null;
  expected_days: number;
  present_days: number;
  excused_days: number;
  absent_days: number;
  attendance_rate: number;
  late_days: number;
  extra_hours: number;
  extra_fee: number;
};

/** A school day of the period (get_attendance_period_days). */
export type PeriodDayRow = {
  day: string;
  expected: number;
  present: number;
  excused: number;
  absent: number;
  attendance_rate: number;
};

/** A late, charged or flagged day (get_attendance_period_records). */
export type PeriodRecordRow = {
  attendance_id: string;
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  /** The child's unique code (CH-2026-00012). */
  child_code: string | null;
  class_id: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  father_name_ar: string | null;
  father_name_en: string | null;
  /** Every parent's name and phone, to search on. */
  parents_text: string | null;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  check_out_method: string | null;
  pickup_person_name: string | null;
  pickup_relationship: string | null;
  is_late: boolean;
  late_minutes: number;
  extra_hours: number;
  extra_hours_covered: number;
  extra_hours_billed: number;
  extra_fee: number;
  late_charge_waived: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_due_date: string | null;
  invoice_paid_at: string | null;
  needs_review: boolean;
  review_reason: string | null;
};

/** The children a today number counts. */
export function dayRowsFor(tile: TodayTile | 'attended', rows: DayChildRow[]): DayChildRow[] {
  switch (tile) {
    case 'attended':
      return rows.filter((r) => r.day_status === 'in_nursery' || r.day_status === 'picked_up');
    case 'in_nursery':
    case 'picked_up':
    case 'absent':
    case 'excused':
      return rows.filter((r) => r.day_status === tile);
    case 'late_now':
      return rows.filter((r) => r.late_now);
    case 'extra_today':
      return rows.filter((r) => Number(r.extra_hours) > 0);
  }
}

export type RecordTile = Extract<PeriodTile, 'late' | 'billed' | 'collected' | 'outstanding' | 'review'>;

/** The days a period money / late / review number counts. */
export function recordRowsFor(tile: RecordTile, rows: PeriodRecordRow[]): PeriodRecordRow[] {
  const charged = (r: PeriodRecordRow) => Number(r.extra_fee) > 0;
  switch (tile) {
    case 'late':
      // "Children with extra hours": the days they took some.
      return rows.filter((r) => Number(r.extra_hours) > 0);
    case 'billed':
      return rows.filter(charged);
    case 'collected':
      return rows.filter((r) => charged(r) && r.invoice_status === 'paid');
    case 'outstanding':
      return rows.filter((r) => charged(r) && (r.invoice_status === 'pending' || r.invoice_status === 'overdue'));
    case 'review':
      return rows.filter((r) => r.needs_review);
  }
}

/** A child's name in the reader's language, falling back to the other one. */
export function childName(row: { full_name_ar: string | null; full_name_en: string | null }, lang: string): string {
  const ar = row.full_name_ar?.trim() || '';
  const en = row.full_name_en?.trim() || '';
  return (lang.startsWith('ar') ? ar || en : en || ar) || '—';
}

export type Searchable = {
  full_name_ar: string | null;
  full_name_en: string | null;
  child_code?: string | null;
  parents_text?: string | null;
};

/** Rows that hold every search word: in the child's name (Arabic or English) or code, or a parent's name or phone. */
export function matchesSearch(row: Searchable, search: string): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [row.full_name_ar, row.full_name_en, row.child_code, row.parents_text].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** A row the lists can search and filter by class. */
export type ListRow = Searchable & { class_id: string | null; class_name_ar: string | null; class_name_en: string | null };

/** The table's filters: the search, and a class ('all', or a class id; 'none' for children in no class). */
export type ListFilters = { search: string; classId: string };
export const NO_LIST_FILTERS: ListFilters = { search: '', classId: 'all' };

export function filterList<T extends Searchable & { class_id: string | null }>(rows: T[], filters: ListFilters): T[] {
  return rows.filter((row) => {
    if (filters.classId === 'none' ? row.class_id !== null : filters.classId !== 'all' && row.class_id !== filters.classId) return false;
    return matchesSearch(row, filters.search);
  });
}

/** The classes the rows belong to, by name, for the class filter (children in no class last). */
export function classOptions(
  rows: Array<{ class_id: string | null; class_name_ar: string | null; class_name_en: string | null }>,
  lang: string,
): Array<{ id: string; name: string | null }> {
  const ar = lang.startsWith('ar');
  const seen = new Map<string, string | null>();
  for (const row of rows) {
    const id = row.class_id ?? 'none';
    if (!seen.has(id)) seen.set(id, row.class_id ? (ar ? row.class_name_ar || row.class_name_en : row.class_name_en || row.class_name_ar) : null);
  }
  return [...seen]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.id === 'none' ? 1 : b.id === 'none' ? -1 : (a.name ?? '').localeCompare(b.name ?? '', ar ? 'ar' : 'en')));
}

/** One child's extra hours over the period, from the days they took some. */
export type ChildExtraHours = Searchable & {
  child_id: string;
  class_id: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  father_name_ar: string | null;
  father_name_en: string | null;
  days: number;
  hours: number;
  covered: number;
  billed_hours: number;
  fee: number;
  last_day: string;
};

/** The children who took extra hours, most hours first: the card's "children with extra hours". */
export function extraHoursByChild(rows: PeriodRecordRow[]): ChildExtraHours[] {
  const byChild = new Map<string, ChildExtraHours>();
  for (const row of rows) {
    if (Number(row.extra_hours) <= 0) continue;
    const current = byChild.get(row.child_id) ?? {
      child_id: row.child_id,
      full_name_ar: row.full_name_ar,
      full_name_en: row.full_name_en,
      child_code: row.child_code,
      parents_text: row.parents_text,
      class_id: row.class_id,
      class_name_ar: row.class_name_ar,
      class_name_en: row.class_name_en,
      father_name_ar: row.father_name_ar,
      father_name_en: row.father_name_en,
      days: 0,
      hours: 0,
      covered: 0,
      billed_hours: 0,
      fee: 0,
      last_day: row.attendance_date,
    };
    current.days += 1;
    current.hours = Math.round((current.hours + Number(row.extra_hours)) * 100) / 100;
    current.covered = Math.round((current.covered + Number(row.extra_hours_covered)) * 100) / 100;
    current.billed_hours = Math.round((current.billed_hours + Number(row.extra_hours_billed)) * 100) / 100;
    current.fee = Math.round((current.fee + Number(row.extra_fee)) * 100) / 100;
    if (row.attendance_date > current.last_day) current.last_day = row.attendance_date;
    byChild.set(row.child_id, current);
  }
  return [...byChild.values()].sort((a, b) => b.hours - a.hours || b.days - a.days);
}

/** Sunday … Saturday, as Date.getDay() and the server's weekday filter number them. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** The weekday's name in the reader's language (2026-10-25 was a Sunday). */
export function weekdayName(weekday: number, locale: string): string {
  return new Date(Date.UTC(2026, 9, 25 + weekday, 12)).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
}

export type ChildSortKey = 'name' | 'rate' | 'present' | 'absent' | 'excused';
export type SortDirection = 'asc' | 'desc';

/** The period's children in the chosen order; ties fall back to the name. */
export function sortPeriodChildren(rows: PeriodChildRow[], key: ChildSortKey, direction: SortDirection, lang: string): PeriodChildRow[] {
  const value = (r: PeriodChildRow): number => {
    if (key === 'rate') return Number(r.attendance_rate);
    if (key === 'present') return r.present_days;
    if (key === 'absent') return r.absent_days;
    if (key === 'excused') return r.excused_days;
    return 0;
  };
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const byValue = key === 'name' ? 0 : (value(a) - value(b)) * sign;
    if (byValue !== 0) return byValue;
    const byName = childName(a, lang).localeCompare(childName(b, lang), lang.startsWith('ar') ? 'ar' : 'en');
    return key === 'name' ? byName * sign : byName;
  });
}

/**
 * The days a child's record opens on from the card: the period itself, or for a single day the
 * 30 days up to it (the day with the weeks before it).
 */
export function childRecordRange(range: DateRange): DateRange {
  return daysInRange(range) === 1 ? { from: addCalendarDaysYmd(range.to, -29), to: range.to } : range;
}

/** The child's record, open on its attendance for those days. */
export function childRecordLink(basePath: string, childId: string, range: DateRange): string {
  const days = childRecordRange(range);
  const query = new URLSearchParams({ tab: 'attendance', from: days.from, to: days.to });
  return `${basePath}/children/${childId}?${query.toString()}`;
}

/** The attendance log reads at most this many days; a longer period opens on its last ones. */
export const LOG_RANGE_DAYS = 92;

/** The attendance log, filtered to the days waiting for a review in (the end of) the period. */
export function reviewLogLink(basePath: string, range: DateRange): string {
  const from = daysInRange(range) > LOG_RANGE_DAYS ? addCalendarDaysYmd(range.to, -(LOG_RANGE_DAYS - 1)) : range.from;
  const query = new URLSearchParams({ from, to: range.to, review: '1' });
  return `${basePath}/attendance/logs?${query.toString()}`;
}

/** A real calendar day written YYYY-MM-DD (not 2026-02-30). */
function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A from / to pair read from a link, when both are real dates in order and at most `maxDays` apart. */
export function rangeFromSearch(params: URLSearchParams, maxDays: number): DateRange | null {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  if (!isDay(from) || !isDay(to)) return null;
  if (from > to || daysInRange({ from, to }) > maxDays) return null;
  return { from, to };
}

/** One check-in of the period (get_attendance_period_log), with the total of the rows that match. */
export type AttendanceLogRow = {
  attendance_id: string;
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  child_code: string | null;
  class_id: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  father_name_ar: string | null;
  father_name_en: string | null;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  check_in_method: string | null;
  check_out_method: string | null;
  dropoff_name_ar: string | null;
  dropoff_name_en: string | null;
  dropoff_relationship: string | null;
  pickup_person_name: string | null;
  pickup_relationship: string | null;
  checked_in_by_ar: string | null;
  checked_in_by_en: string | null;
  checked_out_by_ar: string | null;
  checked_out_by_en: string | null;
  late_minutes: number;
  extra_hours: number;
  extra_hours_covered: number;
  extra_fee: number;
  invoice_status: string | null;
  needs_review: boolean;
  total_count: number;
};

/** The log's filters, applied on the server. */
export type LogFilters = { search: string; classId: string; weekday: 'all' | number; day: string };
export const NO_LOG_FILTERS: LogFilters = { search: '', classId: 'all', weekday: 'all', day: '' };

/** Minutes between arriving and leaving, or null while the child is still here. */
export function minutesAtNursery(row: { check_in: string | null; check_out: string | null }): number | null {
  if (!row.check_in || !row.check_out) return null;
  return Math.max(0, Math.round((Date.parse(row.check_out) - Date.parse(row.check_in)) / 60_000));
}
