/*
 * Staff clocking in and out as plain data and rules (no React, no network): a member of staff's day,
 * where it stands, and the checks on recording one by hand. The database (clock_staff,
 * record_staff_attendance) refuses the same things.
 */
import { numberOrNull, obj, text, textOrNull } from '@/lib/jsonRead';

/** Arriving up to this many minutes after the nursery opens is on time. */
export const LATE_GRACE_MINUTES = 5;
export const NOTE_MAX = 200;

export type StaffDay = {
  checkInAt: string | null;
  checkOutAt: string | null;
  status: 'present' | 'late' | null;
  lateMinutes: number | null;
  workHours: number | null;
  source: 'self' | 'admin' | null;
  note: string | null;
};

export type MyStaffDay = {
  today: string;
  schoolDay: boolean;
  opensAt: string | null;
  closesAt: string | null;
  timezone: string;
  day: StaffDay | null;
  absence: { reason: string; startsOn: string; endsOn: string } | null;
};

export type ClockStage = 'not_in' | 'in' | 'left';

export function clockStage(day: Pick<StaffDay, 'checkInAt' | 'checkOutAt'> | null): ClockStage {
  if (!day?.checkInAt) return 'not_in';
  return day.checkOutAt ? 'left' : 'in';
}

export const isLate = (lateMinutes: number | null | undefined) => (lateMinutes ?? 0) > LATE_GRACE_MINUTES;

const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);

export function toStaffDay(raw: unknown): StaffDay | null {
  const d = obj(raw);
  if (!d.check_in_at && !d.id) return null;
  return {
    checkInAt: textOrNull(d.check_in_at),
    checkOutAt: textOrNull(d.check_out_at),
    status: d.status === 'late' ? 'late' : d.status === 'present' ? 'present' : null,
    lateMinutes: numberOrNull(d.late_minutes),
    workHours: numberOrNull(d.work_hours),
    source: d.source === 'self' || d.source === 'admin' ? d.source : null,
    note: textOrNull(d.notes),
  };
}

/** get_my_staff_day's answer, checked. */
export function toMyStaffDay(raw: unknown): MyStaffDay {
  const r = obj(raw);
  const absence = obj(r.absence);
  return {
    today: text(r.today).slice(0, 10),
    schoolDay: r.school_day !== false,
    opensAt: hhmm(r.opens_at),
    closesAt: hhmm(r.closes_at),
    timezone: text(r.timezone) || 'Africa/Cairo',
    day: toStaffDay(r.day),
    absence: absence.starts_on ? { reason: text(absence.reason) || 'other', startsOn: text(absence.starts_on), endsOn: text(absence.ends_on) } : null,
  };
}

export type TimeIssue = 'in_required' | 'out_before_in' | 'in_future' | 'out_future' | 'note_too_long';

/**
 * What is wrong with a day recorded by hand (times HH:MM in the nursery's clock), or null.
 * `now` is the nursery's time now when the day is today, else null.
 */
export function recordIssue(checkIn: string, checkOut: string, note: string, now: string | null): TimeIssue | null {
  if (!checkIn) return 'in_required';
  if (checkOut && checkOut <= checkIn) return 'out_before_in';
  if (now && checkIn > now) return 'in_future';
  if (now && checkOut && checkOut > now) return 'out_future';
  if (note.trim().length > NOTE_MAX) return 'note_too_long';
  return null;
}

/** "7.5" hours as "7 h 30 min". */
export function hoursParts(hours: number | null): { h: number; m: number } | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  const total = Math.round(hours * 60);
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** A moment as HH:MM on a clock in `timeZone` (the nursery's), for time fields. */
export function hhmmIn(value: Date | string | null, timeZone: string): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}
