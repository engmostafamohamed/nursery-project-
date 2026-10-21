// A child's attendance history: which days count, the headline numbers, the weekly chart, the
// arrival/departure chart and the absences list.
import { describe, expect, it } from 'vitest';

import type { AttendanceDay } from '@/lib/attendanceApi';

import {
  absenceDays,
  historyDays,
  historyStats,
  stayMinutes,
  stayPoints,
  stayTimeDomain,
  weeklyBuckets,
  weekStartOf,
} from './childAttendanceHistory';

const nobody = { ar: null, en: null };

function day(date: string, status: AttendanceDay['status'], patch: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    childId: 'c1', date, status, attendanceId: null, checkIn: null, checkOut: null, checkInMethod: null, checkOutMethod: null,
    checkedInBy: nobody, checkedOutBy: nobody, pickupPersonName: null, pickupRelationship: null, pickupPhotoUrl: null,
    earlyMinutes: 0, lateMinutes: 0, extraHours: 0, extraHoursCovered: 0, extraHoursBilled: 0, extraFee: 0,
    lateChargeStatus: null, lateChargeWaived: false, invoiceId: null, invoiceStatus: null, needsReview: false, reviewReason: null,
    absenceReason: null, absenceNote: null, dropoffPersonName: nobody, dropoffRelationship: null, absenceReportedBy: nobody,
    absenceReportedAt: null,
    ...patch,
  };
}

// Local times (no offset), as the screens show them.
const attended = (date: string, inAt: string, outAt: string | null, patch: Partial<AttendanceDay> = {}) =>
  day(date, outAt ? 'present' : 'partial', { checkIn: `${date}T${inAt}:00`, checkOut: outAt ? `${date}T${outAt}:00` : null, ...patch });

// Newest first, as the server returns them. 2026-09-06 is a Sunday.
const SERVER_DAYS: AttendanceDay[] = [
  day('2026-09-15', 'upcoming'),
  day('2026-09-14', 'absent'), // today, the child has not come yet
  day('2026-09-13', 'excused', { absenceReason: 'sick', absenceNote: 'Fever' }),
  day('2026-09-12', 'off'),
  day('2026-09-11', 'off'),
  day('2026-09-10', 'absent'),
  day('2026-09-09', 'holiday'),
  attended('2026-09-08', '08:30', null),
  attended('2026-09-07', '08:00', '17:30', { extraHours: 1 }),
  attended('2026-09-06', '07:30', '15:00'),
  day('2026-09-05', 'not_enrolled'),
];
const TODAY = '2026-09-14';

describe('child attendance history', () => {
  it('keeps school days and holidays from enrollment, and leaves out today until the child comes', () => {
    expect(historyDays(SERVER_DAYS, TODAY).map((d) => d.date)).toEqual([
      '2026-09-13', '2026-09-10', '2026-09-09', '2026-09-08', '2026-09-07', '2026-09-06',
    ]);
    // Once the child is checked in, today counts.
    const arrivedToday = [attended(TODAY, '08:10', null), ...SERVER_DAYS.slice(2)];
    expect(historyDays(arrivedToday, TODAY)[0].date).toBe(TODAY);
  });

  it('counts attended days and absences with and without notice', () => {
    const stats = historyStats(historyDays(SERVER_DAYS, TODAY));
    expect(stats).toMatchObject({ expectedDays: 5, attendedDays: 3, withNotice: 1, withoutNotice: 1, ratePct: 60, latePickups: 1, extraHours: 1 });
    // Arrival 07:30, 08:00, 08:30; departure 15:00, 17:30.
    expect(stats.avgArrival).toBe(8 * 60);
    expect(stats.avgDeparture).toBe(16 * 60 + 15);
    expect(historyStats([]).ratePct).toBeNull();
  });

  it('groups the days into weeks starting on Sunday, oldest first', () => {
    expect(weekStartOf('2026-09-06')).toBe('2026-09-06');
    expect(weekStartOf('2026-09-12')).toBe('2026-09-06');
    expect(weekStartOf('2026-09-13')).toBe('2026-09-13');
    expect(weeklyBuckets(historyDays(SERVER_DAYS, TODAY))).toEqual([
      { weekStart: '2026-09-06', attended: 3, withNotice: 0, withoutNotice: 1 },
      { weekStart: '2026-09-13', attended: 0, withNotice: 1, withoutNotice: 0 },
    ]);
  });

  it('plots the time at the nursery per day, oldest first, and an arrival with no check-out', () => {
    const points = stayPoints(historyDays(SERVER_DAYS, TODAY));
    expect(points.map((p) => [p.date, p.stay, p.arrivalOnly])).toEqual([
      ['2026-09-06', [450, 900], null],
      ['2026-09-07', [480, 1050], null],
      ['2026-09-08', null, 510],
      ['2026-09-10', null, null],
      ['2026-09-13', null, null],
    ]);
    // Whole hours around all times, never narrower than 07:00–17:00.
    expect(stayTimeDomain(points)).toEqual([7 * 60, 18 * 60]);
    expect(stayTimeDomain([])).toEqual([7 * 60, 17 * 60]);
  });

  it('lists the absences, newest first, and the time spent each day', () => {
    expect(absenceDays(historyDays(SERVER_DAYS, TODAY)).map((d) => [d.date, d.status, d.absenceReason])).toEqual([
      ['2026-09-13', 'excused', 'sick'],
      ['2026-09-10', 'absent', null],
    ]);
    expect(stayMinutes(attended('2026-09-07', '08:00', '17:30'))).toBe(570);
    expect(stayMinutes(attended('2026-09-08', '08:30', null))).toBeNull();
  });
});
