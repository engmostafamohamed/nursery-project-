import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import {
  countStates,
  dailyTrend,
  datesBetween,
  dayState,
  dowOf,
  expectedOn,
  latestArrivers,
  personSummaries,
  punctuality,
  shiftOn,
  spanDays,
  toNurseryStaffDays,
} from './staffAttendanceRange';

const src = path.resolve(__dirname, '../..');

/** A Sunday through the following Saturday, so every weekday is in the span exactly once. */
const FROM = '2026-11-15';
const TO = '2026-11-21';

const raw = (over: Record<string, unknown> = {}) => ({
  today: TO,
  from: FROM,
  to: TO,
  timezone: 'Africa/Cairo',
  school_days: [FROM, '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', TO],
  house: { from: '08:00:00', to: '17:00:00' },
  staff: [
    {
      id: 'hoda', ar: 'هدى', en: 'Hoda', role: 'teacher', status: 'active', position: 'Lead teacher', department: 'teaching',
      schedule: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, from: '10:00:00', to: '19:00:00' })),
    },
    { id: 'sara', ar: 'سارة', en: 'Sara', role: 'teacher', status: 'active', position: null, department: null, schedule: [] },
    { id: 'gone', ar: 'منى', en: 'Gone', role: 'teacher', status: 'inactive', position: null, department: null, schedule: [] },
  ],
  days: [
    { id: 'd1', user_id: 'hoda', work_date: '2026-11-16', check_in_at: '2026-11-16T08:00:00Z', check_out_at: '2026-11-16T17:00:00Z', status: 'present', late_minutes: 0, work_hours: 9, source: 'self', needs_review: false, review_reason: null },
    { id: 'd2', user_id: 'hoda', work_date: '2026-11-17', check_in_at: '2026-11-17T08:20:00Z', check_out_at: '2026-11-17T17:00:00Z', status: 'late', late_minutes: 20, work_hours: 8.67, source: 'self', needs_review: false, review_reason: null },
    { id: 'd3', user_id: 'sara', work_date: '2026-11-18', check_in_at: '2026-11-18T06:00:00Z', check_out_at: null, status: 'present', late_minutes: 0, work_hours: null, source: 'self', needs_review: false, review_reason: null },
    { id: 'd4', user_id: 'sara', work_date: '2026-11-19', check_in_at: '2026-11-19T06:00:00Z', check_out_at: '2026-11-19T10:00:00Z', status: 'present', late_minutes: 0, work_hours: 4, source: 'self', needs_review: true, review_reason: 'left_early' },
    { id: '', user_id: 'sara', work_date: '2026-11-20', check_in_at: null, check_out_at: null },
  ],
  ...over,
});

const away = [{ userId: 'hoda', startsOn: '2026-11-20', endsOn: TO, cancelled: false }];

describe("reading the nursery's staff days", () => {
  it('keeps the span, the people and their days', () => {
    const data = toNurseryStaffDays(raw());
    expect(data.from).toBe(FROM);
    expect(data.staff).toHaveLength(3);
    expect(data.days).toHaveLength(4);
    expect(data.schoolDays).toHaveLength(7);
  });

  it('keeps each shift and knows who has none', () => {
    const data = toNurseryStaffDays(raw());
    expect(data.staff[0]?.schedule[0]).toEqual({ dow: 0, from: '10:00', to: '19:00' });
    expect(data.staff[1]?.schedule).toEqual([]);
    expect(data.house).toEqual({ from: '08:00', to: '17:00' });
  });

  it('knows who has left', () => {
    const data = toNurseryStaffDays(raw());
    expect(data.staff[2]?.active).toBe(false);
    expect(data.staff[0]?.active).toBe(true);
  });

  it('drops a day with nothing behind it', () => {
    expect(toNurseryStaffDays(raw()).days.map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('reads an empty answer without inventing anything', () => {
    const data = toNurseryStaffDays({});
    expect(data.staff).toEqual([]);
    expect(data.days).toEqual([]);
    expect(data.timezone).toBe('Africa/Cairo');
  });
});

describe('the shift behind a day', () => {
  it('is the weekday that date falls on', () => {
    expect(dowOf('2026-11-15')).toBe(0);
    expect(dowOf('2026-11-21')).toBe(6);
  });

  it('is her own when she has one', () => {
    const data = toNurseryStaffDays(raw());
    expect(shiftOn(data.staff[0]!, '2026-11-16', data.house)).toEqual({ from: '10:00', to: '19:00' });
  });

  it("is the nursery's hours for somebody with none", () => {
    const data = toNurseryStaffDays(raw());
    expect(shiftOn(data.staff[1]!, '2026-11-16', data.house)).toEqual({ from: '08:00', to: '17:00' });
  });

  it('is nothing on a weekday she does not work', () => {
    const data = toNurseryStaffDays(raw({
      staff: [{ id: 'part', ar: 'ن', en: 'Part', role: 'teacher', status: 'active', schedule: [{ dow: 1, from: '09:00:00', to: '13:00:00' }] }],
    }));
    expect(shiftOn(data.staff[0]!, '2026-11-16', data.house)).toEqual({ from: '09:00', to: '13:00' });
    expect(shiftOn(data.staff[0]!, '2026-11-17', data.house)).toBeNull();
  });
});

describe('whether somebody was due at work', () => {
  it('is no on a day the nursery was shut, whatever their shift', () => {
    const data = toNurseryStaffDays(raw({ school_days: ['2026-11-16'] }));
    expect(expectedOn(data.staff[0]!, '2026-11-16', new Set(data.schoolDays), data.house)).toBe(true);
    expect(expectedOn(data.staff[0]!, '2026-11-17', new Set(data.schoolDays), data.house)).toBe(false);
  });

  it('is no on a weekday that is not theirs, although the nursery was open', () => {
    const data = toNurseryStaffDays(raw({
      staff: [{ id: 'part', ar: 'ن', en: 'Part', role: 'teacher', status: 'active', schedule: [{ dow: 1, from: '09:00:00', to: '13:00:00' }] }],
    }));
    expect(expectedOn(data.staff[0]!, '2026-11-17', new Set(data.schoolDays), data.house)).toBe(false);
  });
});

describe('where one day stands', () => {
  const data = toNurseryStaffDays(raw());

  it('waits for the manager before anything else', () => {
    expect(dayState(data.days[3]!)).toBe('review');
  });

  it('is still here when nobody has clocked out', () => {
    expect(dayState(data.days[2]!)).toBe('still_in');
  });

  it('tells on time from late by the grace, not by a minute', () => {
    expect(dayState(data.days[0]!)).toBe('on_time');
    expect(dayState(data.days[1]!)).toBe('late');
    expect(dayState({ ...data.days[1]!, lateMinutes: 3 })).toBe('on_time');
  });
});

describe('the span, day by day and person by person', () => {
  const data = toNurseryStaffDays(raw());
  const days = spanDays(data, away);

  it('holds a row for every day recorded', () => {
    expect(days.filter((d) => d.row)).toHaveLength(4);
  });

  it('calls a day away when an absence covers it, and never missing', () => {
    const hodaOnFriday = days.find((d) => d.person.id === 'hoda' && d.date === '2026-11-20');
    expect(hodaOnFriday?.state).toBe('away');
  });

  it('calls a day missing when somebody was due and never came', () => {
    const missing = days.filter((d) => d.state === 'missing');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((d) => d.date <= data.today)).toBe(true);
  });

  it('says nothing at all about a day the nursery was shut', () => {
    const shut = toNurseryStaffDays(raw({ school_days: ['2026-11-16'], days: [] }));
    const rows = spanDays(shut, []);
    // The one open day is owed by all three; the six shut days are owed by nobody.
    expect(rows.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-16', '2026-11-16']);
    expect(rows.every((d) => d.state === 'missing')).toBe(true);
  });

  it('says nothing when the nursery was shut all span', () => {
    const shut = toNurseryStaffDays(raw({ school_days: [], days: [] }));
    expect(spanDays(shut, [])).toHaveLength(0);
  });

  it('never looks past today', () => {
    const early = toNurseryStaffDays(raw({ today: '2026-11-16', days: [] }));
    expect(spanDays(early, []).every((d) => d.date <= '2026-11-16')).toBe(true);
  });

  it('leaves out anybody the filters dropped', () => {
    const onlyHoda = spanDays({ ...data, staff: data.staff.filter((p) => p.id === 'hoda') }, away);
    expect(onlyHoda.every((d) => d.person.id === 'hoda')).toBe(true);
  });
});

describe('what the span came to', () => {
  const data = toNurseryStaffDays(raw());
  const days = spanDays(data, away);
  const summaries = personSummaries(days, data.staff);
  const hoda = summaries.find((s) => s.person.id === 'hoda')!;

  it('counts the days somebody was here and the days they were due', () => {
    expect(hoda.present).toBe(2);
    expect(hoda.expected).toBeGreaterThanOrEqual(hoda.present);
  });

  it('does not count a day away against them', () => {
    expect(hoda.away).toBe(2);
    expect(hoda.expected).toBe(days.filter((d) => d.person.id === 'hoda' && d.state !== 'away').length);
  });

  it('adds up the lateness and the hours', () => {
    expect(hoda.late).toBe(1);
    expect(hoda.lateMinutes).toBe(20);
    expect(hoda.hours).toBe(17.67);
  });

  it('is nothing rather than zero when nobody was due', () => {
    const shut = toNurseryStaffDays(raw({ school_days: [], days: [] }));
    expect(personSummaries(spanDays(shut, []), shut.staff)[0]?.rate).toBeNull();
  });

  it('keeps a person with nothing recorded, so nobody vanishes from the table', () => {
    expect(summaries).toHaveLength(3);
  });
});

describe('the figures above the table', () => {
  const data = toNurseryStaffDays(raw());
  const days = spanDays(data, away);

  it('count each state once', () => {
    const counts = countStates(days);
    expect(counts.all).toBe(days.length);
    expect(counts.review).toBe(1);
    expect(counts.still_in).toBe(1);
    expect(counts.late).toBe(1);
    expect(counts.on_time).toBe(1);
  });

  it('read punctuality out of the days recorded, not the days in the span', () => {
    expect(punctuality(countStates(days))).toBe(50);
  });

  it('read nothing at all when no day was recorded', () => {
    const shut = toNurseryStaffDays(raw({ days: [] }));
    expect(punctuality(countStates(spanDays(shut, [])))).toBeNull();
  });
});

describe('the charts', () => {
  const data = toNurseryStaffDays(raw());
  const days = spanDays(data, away);

  it('give the trend a point for every day of the span, empty ones included', () => {
    expect(dailyTrend(days, FROM, TO)).toHaveLength(7);
  });

  it('put each day in its own point', () => {
    const point = dailyTrend(days, FROM, TO).find((p) => p.date === '2026-11-17');
    expect(point?.present).toBe(1);
    expect(point?.late).toBe(1);
  });

  it('name the people the minutes belong to, worst first', () => {
    const late = latestArrivers(personSummaries(days, data.staff));
    expect(late[0]?.person.id).toBe('hoda');
    expect(late).toHaveLength(1);
  });
});

describe('every date between two', () => {
  it('counts both ends in', () => {
    expect(datesBetween('2026-11-15', '2026-11-17')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
  });

  it('is one day for a span of one', () => {
    expect(datesBetween(TO, TO)).toEqual([TO]);
  });

  it('is nothing when the end comes first, or either is missing', () => {
    expect(datesBetween(TO, FROM)).toEqual([]);
    expect(datesBetween('', TO)).toEqual([]);
  });

  it('crosses a month end', () => {
    expect(datesBetween('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });
});

describe('the staff attendance texts', () => {
  const files = [
    path.join(src, 'features/staff-attendance/StaffAttendanceStats.tsx'),
    path.join(src, 'features/staff-attendance/StaffAttendanceTables.tsx'),
    path.join(src, 'pages/admin/AdminStaffAttendancePage.tsx'),
    path.join(src, 'lib/attendanceTabs.ts'),
  ];

  it('exist in English and Arabic', () => {
    expect(missingTexts(textKeysIn(files))).toEqual([]);
  });

  it('count people, days and minutes the way Arabic counts', () => {
    expect(missingArabicPlurals([
      'staffAttendance.table.people',
      'staffAttendance.table.dayCount',
      'staffAttendance.table.byMinutes',
      'staffAttendance.tiles.lateMinutes',
    ])).toEqual([]);
  });
});
