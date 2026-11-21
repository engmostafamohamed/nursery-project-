import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingTexts, textKeysIn } from '@/test/localeKeys';

import { arrivalHistogram, busiestHour, classBreakdown, hourIn, type DayRow } from './attendanceDay';

const src = path.resolve(__dirname, '../..');

const names = new Map([['b1', 'Butterflies'], ['b2', 'Bees']]);
const nameOf = (id: string) => names.get(id) ?? '';

const rows: DayRow[] = [
  { classId: 'b1', status: 'present', checkIn: '2026-11-21T06:10:00Z' },
  { classId: 'b1', status: 'partial', checkIn: '2026-11-21T06:45:00Z' },
  { classId: 'b1', status: 'absent', checkIn: null },
  { classId: 'b2', status: 'present', checkIn: '2026-11-21T07:05:00Z' },
  { classId: 'b2', status: 'excused', checkIn: null },
  { classId: null, status: 'present', checkIn: '2026-11-21T09:30:00Z' },
];

describe('the day, class by class', () => {
  it('counts a child still inside as here', () => {
    const bars = classBreakdown(rows, nameOf, 'No class');
    const butterflies = bars.find((b) => b.id === 'b1');
    expect(butterflies).toEqual({ id: 'b1', name: 'Butterflies', here: 2, absent: 1, excused: 0 });
  });

  it('tells an excused day from an absent one', () => {
    const bees = classBreakdown(rows, nameOf, 'No class').find((b) => b.id === 'b2');
    expect(bees?.excused).toBe(1);
    expect(bees?.absent).toBe(0);
  });

  it('gathers the children in no class under one name', () => {
    const none = classBreakdown(rows, nameOf, 'No class').find((b) => b.id === '');
    expect(none?.name).toBe('No class');
    expect(none?.here).toBe(1);
  });

  it('puts the fullest class first', () => {
    expect(classBreakdown(rows, nameOf, 'No class')[0]?.id).toBe('b1');
  });

  it('leaves out a class the day says nothing about', () => {
    const quiet: DayRow[] = [{ classId: 'b1', status: 'off', checkIn: null }];
    expect(classBreakdown(quiet, nameOf, 'No class')).toEqual([]);
  });

  it('reads an empty day without inventing anything', () => {
    expect(classBreakdown([], nameOf, 'No class')).toEqual([]);
  });
});

describe('the hours they arrived in', () => {
  it('counts each arrival in the nursery’s own hour, not the reader’s', () => {
    const bars = arrivalHistogram(rows, 'Africa/Cairo');
    expect(bars[0]).toEqual({ hour: 8, label: '08:00', count: 2 });
    expect(bars.find((b) => b.hour === 9)?.count).toBe(1);
  });

  it('keeps a quiet hour between two busy ones', () => {
    const bars = arrivalHistogram(rows, 'Africa/Cairo');
    expect(bars.map((b) => b.hour)).toEqual([8, 9, 10, 11]);
    expect(bars.find((b) => b.hour === 10)?.count).toBe(0);
  });

  it('reads the same moments differently in another timezone', () => {
    expect(arrivalHistogram(rows, 'UTC')[0]?.hour).toBe(6);
  });

  it('is nothing at all when nobody has arrived', () => {
    expect(arrivalHistogram([{ classId: 'b1', status: 'absent', checkIn: null }], 'Africa/Cairo')).toEqual([]);
  });

  it('ignores a moment that is no moment', () => {
    expect(hourIn('not a date', 'Africa/Cairo')).toBeNull();
    expect(arrivalHistogram([{ classId: 'b1', status: 'present', checkIn: 'rubbish' }], 'Africa/Cairo')).toEqual([]);
  });

  it('names the busiest hour, and nothing when there is none', () => {
    expect(busiestHour(arrivalHistogram(rows, 'Africa/Cairo'))?.label).toBe('08:00');
    expect(busiestHour([])).toBeNull();
  });
});

describe("the day charts' texts", () => {
  it('exist in English and Arabic', () => {
    expect(missingTexts(textKeysIn([path.join(src, 'features/attendance-day/AttendanceDayCharts.tsx')]))).toEqual([]);
  });
});
