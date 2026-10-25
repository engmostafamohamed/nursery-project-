// The family's attendance card: today's numbers, a period's numbers, which days each number lists,
// and the filters by child (name or code), weekday, date and state.
import { describe, expect, it } from 'vitest';

import type { AttendanceDay } from '@/lib/attendanceApi';

import {
  familyDaysFor,
  familyPeriod,
  familyToday,
  filterFamilyDays,
  hasFamilyFilters,
  NO_FAMILY_FILTERS,
  sortFamilyDays,
  type ChildToday,
} from './parentAttendance';

const nobody = { ar: null, en: null };

function day(childId: string, date: string, status: AttendanceDay['status'], patch: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    childId, date, status, attendanceId: null, checkIn: null, checkOut: null, checkInMethod: null, checkOutMethod: null,
    checkedInBy: nobody, checkedOutBy: nobody, pickupPersonName: null, pickupRelationship: null, pickupPhotoUrl: null,
    earlyMinutes: 0, lateMinutes: 0, extraHours: 0, extraHoursCovered: 0, extraHoursBilled: 0, extraFee: 0,
    lateChargeStatus: null, lateChargeWaived: false, invoiceId: null, invoiceStatus: null, needsReview: false, reviewReason: null,
    absenceReason: null, absenceNote: null, dropoffPersonName: nobody, dropoffRelationship: null, absenceReportedBy: nobody, absenceReportedAt: null,
    ...patch,
  };
}

function now(childId: string, status: ChildToday['day_status'], patch: Partial<ChildToday> = {}): ChildToday {
  return { child_id: childId, day: '2026-10-25', day_status: status, check_in: null, check_out: null, pickup_due_at: null, late_now: false, extra_hours: 0, extra_fee: 0, ...patch };
}

describe('today', () => {
  it('counts the children here, gone home, away, and in extra hours right now', () => {
    expect(
      familyToday([
        now('laila', 'in_nursery', { late_now: true, extra_hours: 1, extra_fee: 50 }),
        now('adam', 'picked_up', { extra_hours: 0.5, extra_fee: 25 }),
        now('omar', 'excused'),
        now('sara', 'not_enrolled'),
      ]),
    ).toEqual({
      children: 3, attended: 2, inNursery: 1, pickedUp: 1, absent: 1, withNotice: 1,
      inExtraNow: 1, extraChildren: 2, extraHours: 1.5, extraFee: 75,
    });
  });
});

describe('a period', () => {
  const days = [
    day('laila', '2026-10-04', 'present', { checkIn: '2026-10-04T06:00:00Z', checkOut: '2026-10-04T13:00:00Z' }),
    day('laila', '2026-10-05', 'present', { checkIn: '2026-10-05T07:00:00Z', checkOut: '2026-10-05T15:00:00Z', extraHours: 2, extraFee: 100 }),
    day('laila', '2026-10-06', 'absent'),
    day('adam', '2026-10-05', 'excused'),
    day('adam', '2026-10-06', 'present', { checkIn: '2026-10-06T06:30:00Z', checkOut: '2026-10-06T12:00:00Z', extraHours: 1, extraFee: 50 }),
    day('adam', '2026-10-09', 'off'),
  ];

  it('days attended out of expected, absences with and without notice, extra hours and the usual times', () => {
    const stats = familyPeriod(days.filter((d) => d.status !== 'off'));
    expect({ ...stats, avgArrival: stats.avgArrival !== null, avgDeparture: stats.avgDeparture !== null }).toEqual({
      expected: 5, attended: 3, absent: 1, withNotice: 1, ratePct: 60,
      extraDays: 2, extraChildren: 2, extraHours: 3, extraFee: 150, avgArrival: true, avgDeparture: true,
    });
  });

  it('each number lists the days it counts; days off are never listed', () => {
    const list = (tile: Parameters<typeof familyDaysFor>[0]) => familyDaysFor(tile, days).map((d) => `${d.childId} ${d.date}`);
    expect(list('attended')).toEqual(['laila 2026-10-04', 'laila 2026-10-05', 'adam 2026-10-06']);
    expect(list('absent')).toEqual(['laila 2026-10-06', 'adam 2026-10-05']);
    expect(list('extra')).toEqual(['laila 2026-10-05', 'adam 2026-10-06']);
    expect(list('rate')).toHaveLength(5);
  });

  it('in extra hours now: still here, among the children late right now', () => {
    const today = [day('laila', '2026-10-25', 'partial'), day('adam', '2026-10-25', 'partial')];
    expect(familyDaysFor('late_now', today, new Set(['adam'])).map((d) => d.childId)).toEqual(['adam']);
  });

  it('filters by child name or code, child, weekday, date and state, newest first', () => {
    const children = new Map([
      ['laila', { nameAr: 'ليلى', nameEn: 'Laila', code: 'CH-2026-00007' }],
      ['adam', { nameAr: 'آدم', nameEn: 'Adam', code: 'CH-2026-00008' }],
    ]);
    const keys = (filters: Partial<typeof NO_FAMILY_FILTERS>) =>
      sortFamilyDays(filterFamilyDays(days, { ...NO_FAMILY_FILTERS, ...filters }, children)).map((d) => `${d.childId} ${d.date}`);
    expect(keys({ search: '00008' })).toEqual(['adam 2026-10-09', 'adam 2026-10-06', 'adam 2026-10-05']);
    expect(keys({ search: 'ليلى', state: 'attended' })).toEqual(['laila 2026-10-05', 'laila 2026-10-04']);
    // 4 October 2026 was a Sunday.
    expect(keys({ weekday: 0 })).toEqual(['laila 2026-10-04']);
    expect(keys({ day: '2026-10-05' })).toEqual(['adam 2026-10-05', 'laila 2026-10-05']);
    expect(keys({ childId: 'adam', state: 'excused' })).toEqual(['adam 2026-10-05']);
    expect(keys({ state: 'extra' })).toEqual(['adam 2026-10-06', 'laila 2026-10-05']);
    expect(hasFamilyFilters(NO_FAMILY_FILTERS)).toBe(false);
    expect(hasFamilyFilters({ ...NO_FAMILY_FILTERS, weekday: 0 })).toBe(true);
  });
});
