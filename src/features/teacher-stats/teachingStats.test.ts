import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingTexts, textKeysIn } from '@/test/localeKeys';

import { attendanceRate, biggestClass, toTeachingStats } from './teachingStats';

const src = path.resolve(__dirname, '../..');

const raw = (over: Record<string, unknown> = {}) => ({
  from: '2026-11-07',
  to: '2026-11-20',
  classes: [
    { id: 'b1', ar: 'الفراشات', en: 'Butterflies', role: 'lead', children: 20 },
    { id: 'b2', ar: 'النحل', en: 'Bees', role: 'co_teacher', children: 25 },
  ],
  attendance: [
    { day: '2026-11-18', here: 40, away: 5 },
    { day: '2026-11-19', here: 45, away: 0 },
  ],
  reports: [{ day: '2026-11-19', sent: 30, draft: 2 }],
  totals: { children: 45, classes: 2, reports_sent: 30, days_recorded: 2 },
  ...over,
});

describe("reading a teacher's fortnight", () => {
  it('keeps her classes, their size and her place in each', () => {
    const stats = toTeachingStats(raw());
    expect(stats.classes).toHaveLength(2);
    expect(stats.classes[1]?.role).toBe('co_teacher');
    expect(stats.totals.children).toBe(45);
  });

  it('keeps the two trends', () => {
    const stats = toTeachingStats(raw());
    expect(stats.attendance[1]).toEqual({ day: '2026-11-19', here: 45, away: 0 });
    expect(stats.reports[0]?.sent).toBe(30);
  });

  it('reads an empty fortnight without inventing anything', () => {
    const stats = toTeachingStats({});
    expect(stats.classes).toEqual([]);
    expect(stats.totals.children).toBe(0);
  });

  it('never reads a negative number of children away', () => {
    expect(toTeachingStats(raw({ attendance: [{ day: 'd', here: 5, away: -3 }] })).attendance[0]?.away).toBe(0);
  });
});

describe('how many of the children expected were there', () => {
  it('is the share across the whole fortnight', () => {
    expect(attendanceRate(toTeachingStats(raw()))).toBe(94);
  });

  it('is nothing at all while no day has been recorded', () => {
    expect(attendanceRate(toTeachingStats(raw({ attendance: [] })))).toBeNull();
    expect(attendanceRate(null)).toBeNull();
  });

  it('is nothing rather than zero when nobody was expected', () => {
    expect(attendanceRate(toTeachingStats(raw({ attendance: [{ day: 'd', here: 0, away: 0 }] })))).toBeNull();
  });
});

describe('her busiest class', () => {
  it('is the one holding the most children', () => {
    expect(biggestClass(toTeachingStats(raw()))?.nameEn).toBe('Bees');
  });

  it('is nothing when she teaches none', () => {
    expect(biggestClass(toTeachingStats(raw({ classes: [] })))).toBeNull();
  });
});

describe('teaching stats texts', () => {
  it('exist in English and Arabic', () => {
    expect(missingTexts(textKeysIn([path.join(src, 'features/teacher-stats/TeachingStatsPanel.tsx')]))).toEqual([]);
  });
});
