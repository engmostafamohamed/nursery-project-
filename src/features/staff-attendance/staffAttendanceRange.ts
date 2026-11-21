/*
 * The nursery's staff attendance over a span of days, as plain data and rules (no React, no
 * network): what the span holds, where each day stands, and what each person's span adds up to.
 *
 * A day is not simply present or absent. Somebody can be here and not yet gone, late by minutes
 * that are counted, waiting for the manager's word, away on a reported absence, or missing — which
 * only means anything on a day the nursery was open and that person was due to work. That last one
 * is why the shifts come back with the days: without them "missing" would accuse everybody who has
 * a day off.
 */
import { LATE_GRACE_MINUTES, reviewReason, type ReviewReason } from '@/features/staff-clock/staffClock';
import { count, list, numberOrNull, obj, text, textOrNull } from '@/lib/jsonRead';

/** A shift on one weekday (0 = Sunday, as Postgres counts it). */
export type ShiftDay = { dow: number; from: string | null; to: string | null };

export type StaffPerson = {
  id: string;
  nameAr: string;
  nameEn: string;
  role: string;
  active: boolean;
  position: string | null;
  department: string | null;
  schedule: ShiftDay[];
};

export type StaffDayRow = {
  id: string;
  userId: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  workHours: number | null;
  source: 'self' | 'admin' | null;
  needsReview: boolean;
  reviewReason: ReviewReason | null;
};

export type NurseryStaffDays = {
  today: string;
  from: string;
  to: string;
  timezone: string;
  /** The days the nursery was open: a missing day only counts on one of these. */
  schoolDays: string[];
  staff: StaffPerson[];
  days: StaffDayRow[];
  house: { from: string | null; to: string | null };
};

const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);

export function toNurseryStaffDays(raw: unknown): NurseryStaffDays {
  const r = obj(raw);
  const house = obj(r.house);
  return {
    today: text(r.today).slice(0, 10),
    from: text(r.from).slice(0, 10),
    to: text(r.to).slice(0, 10),
    timezone: text(r.timezone) || 'Africa/Cairo',
    schoolDays: (Array.isArray(r.school_days) ? r.school_days : []).map((d) => text(d).slice(0, 10)).filter(Boolean),
    staff: list(r.staff)
      .filter((s) => text(s.id))
      .map((s) => ({
        id: text(s.id),
        nameAr: text(s.ar),
        nameEn: text(s.en),
        role: text(s.role) || 'teacher',
        active: text(s.status) !== 'inactive',
        position: textOrNull(s.position),
        department: textOrNull(s.department),
        schedule: list(s.schedule).map((d) => ({ dow: count(d.dow), from: hhmm(d.from), to: hhmm(d.to) })),
      })),
    days: list(r.days)
      .filter((d) => text(d.id) && text(d.user_id))
      .map((d) => ({
        id: text(d.id),
        userId: text(d.user_id),
        workDate: text(d.work_date).slice(0, 10),
        checkInAt: textOrNull(d.check_in_at),
        checkOutAt: textOrNull(d.check_out_at),
        lateMinutes: count(d.late_minutes),
        workHours: numberOrNull(d.work_hours),
        source: d.source === 'self' || d.source === 'admin' ? d.source : null,
        needsReview: d.needs_review === true,
        reviewReason: reviewReason(d.review_reason),
      })),
    house: { from: hhmm(house.from), to: hhmm(house.to) },
  };
}

/** Where one day stands. The order matters: the first that fits is the one shown. */
export const DAY_STATES = ['review', 'still_in', 'late', 'on_time', 'away', 'missing'] as const;
export type DayState = (typeof DAY_STATES)[number];

/** The weekday a date falls on, 0 = Sunday, read off the date itself and not the viewer's clock. */
export const dowOf = (ymd: string): number => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/** The shift somebody works on a date: their own, else the nursery's hours, else none. */
export function shiftOn(person: StaffPerson, ymd: string, house: NurseryStaffDays['house']): { from: string | null; to: string | null } | null {
  if (person.schedule.length) {
    const own = person.schedule.find((s) => s.dow === dowOf(ymd));
    return own ? { from: own.from, to: own.to } : null;
  }
  return house.from ? house : null;
}

/**
 * Whether somebody was due at work on a date: the nursery was open, and either they have a shift
 * that weekday or no shift of their own at all (and so keep the nursery's days).
 */
export function expectedOn(person: StaffPerson, ymd: string, schoolDays: Set<string>, house: NurseryStaffDays['house']): boolean {
  if (!schoolDays.has(ymd)) return false;
  return shiftOn(person, ymd, house) !== null;
}

export type AwaySpan = { userId: string | null; startsOn: string; endsOn: string; cancelled: boolean };

/** Whether a reported absence covers the date. */
const awayOn = (spans: AwaySpan[], userId: string, ymd: string) =>
  spans.some((a) => !a.cancelled && a.userId === userId && a.startsOn <= ymd && ymd <= a.endsOn);

export function dayState(row: StaffDayRow): Exclude<DayState, 'away' | 'missing'> {
  if (row.needsReview) return 'review';
  if (row.checkInAt && !row.checkOutAt) return 'still_in';
  return row.lateMinutes > LATE_GRACE_MINUTES ? 'late' : 'on_time';
}

/** One person's day in the span, whether or not anything was recorded for it. */
export type SpanDay = {
  person: StaffPerson;
  date: string;
  state: DayState;
  row: StaffDayRow | null;
  shift: { from: string | null; to: string | null } | null;
};

/**
 * Every day in the span that says something: the days recorded, and the days somebody was due and
 * never came. A day off is not a row — silence about a day nobody owed is not information.
 */
export function spanDays(data: NurseryStaffDays, away: AwaySpan[]): SpanDay[] {
  const schoolDays = new Set(data.schoolDays);
  const byPersonDay = new Map(data.days.map((d) => [`${d.userId}|${d.workDate}`, d]));
  const dates = datesBetween(data.from, data.to);
  const out: SpanDay[] = [];
  for (const person of data.staff) {
    for (const date of dates) {
      const row = byPersonDay.get(`${person.id}|${date}`) ?? null;
      const shift = shiftOn(person, date, data.house);
      if (row) {
        out.push({ person, date, state: dayState(row), row, shift });
      } else if (awayOn(away, person.id, date) && schoolDays.has(date)) {
        out.push({ person, date, state: 'away', row: null, shift });
      } else if (expectedOn(person, date, schoolDays, data.house) && date <= data.today) {
        out.push({ person, date, state: 'missing', row: null, shift });
      }
    }
  }
  return out;
}

/** Every date from one to the other, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`).getTime();
  for (let d = new Date(`${from}T12:00:00Z`); d.getTime() <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export type StateCounts = Record<DayState, number> & { all: number };

export function countStates(days: SpanDay[]): StateCounts {
  const counts = { all: days.length, review: 0, still_in: 0, late: 0, on_time: 0, away: 0, missing: 0 };
  for (const d of days) counts[d.state] += 1;
  return counts;
}

/** What one person's span adds up to: a row of the per-person table. */
export type PersonSummary = {
  person: StaffPerson;
  expected: number;
  present: number;
  late: number;
  lateMinutes: number;
  away: number;
  missing: number;
  review: number;
  stillIn: number;
  hours: number;
  /** Of the days they were due, how many they were here for, or null when none were. */
  rate: number | null;
};

export function personSummaries(days: SpanDay[], staff: StaffPerson[]): PersonSummary[] {
  const byId = new Map<string, PersonSummary>();
  for (const person of staff) {
    byId.set(person.id, {
      person, expected: 0, present: 0, late: 0, lateMinutes: 0, away: 0, missing: 0, review: 0, stillIn: 0, hours: 0, rate: null,
    });
  }
  for (const day of days) {
    const row = byId.get(day.person.id);
    if (!row) continue;
    if (day.state !== 'away') row.expected += 1;
    if (day.row) {
      row.present += 1;
      row.lateMinutes += day.row.lateMinutes;
      row.hours += day.row.workHours ?? 0;
      if (day.state === 'late') row.late += 1;
      if (day.state === 'review') row.review += 1;
      if (day.state === 'still_in') row.stillIn += 1;
    }
    if (day.state === 'away') row.away += 1;
    if (day.state === 'missing') row.missing += 1;
  }
  for (const row of byId.values()) {
    row.hours = Math.round(row.hours * 100) / 100;
    row.rate = row.expected > 0 ? Math.round((row.present / row.expected) * 100) : null;
  }
  return [...byId.values()];
}

/** The span day by day, for the trend chart. */
export type DayPoint = { date: string; present: number; late: number; missing: number; away: number };

export function dailyTrend(days: SpanDay[], from: string, to: string): DayPoint[] {
  const byDate = new Map<string, DayPoint>();
  for (const date of datesBetween(from, to)) byDate.set(date, { date, present: 0, late: 0, missing: 0, away: 0 });
  for (const day of days) {
    const point = byDate.get(day.date);
    if (!point) continue;
    if (day.row) point.present += 1;
    if (day.state === 'late') point.late += 1;
    if (day.state === 'missing') point.missing += 1;
    if (day.state === 'away') point.away += 1;
  }
  return [...byDate.values()];
}

/** The people who were late most in the span, worst first, for the chart beside the trend. */
export function latestArrivers(summaries: PersonSummary[], limit = 6): PersonSummary[] {
  return summaries
    .filter((s) => s.lateMinutes > 0)
    .sort((a, b) => b.lateMinutes - a.lateMinutes || b.late - a.late)
    .slice(0, limit);
}

/** How punctual the whole nursery was: the share of recorded days that were on time, or null. */
export function punctuality(counts: StateCounts): number | null {
  const recorded = counts.on_time + counts.late + counts.still_in + counts.review;
  if (recorded <= 0) return null;
  return Math.round(((counts.on_time + counts.still_in) / recorded) * 100);
}
