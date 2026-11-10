import { describe, expect, it } from 'vitest';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

import { awayDays, monthDays, STAFF_DAY_STATES, staffDayState, summarizeStaffMonth } from './staffMonth';

const facts = (f: Partial<Parameters<typeof staffDayState>[2]> = {}) => ({ lateMinutes: 0, clocked: false, away: false, school: true, ...f });

describe('a member of staff’s month', () => {
  it('says what each day was', () => {
    const today = '2026-11-10';
    expect(staffDayState('2026-11-09', today, facts({ clocked: true, lateMinutes: 3 }))).toBe('on_time');
    expect(staffDayState('2026-11-09', today, facts({ clocked: true, lateMinutes: 32 }))).toBe('late');
    expect(staffDayState('2026-11-09', today, facts({ away: true }))).toBe('away');
    // A weekend or holiday never counts as missing; a gone-by school day with nothing does.
    expect(staffDayState('2026-11-06', today, facts({ school: false }))).toBe('off');
    expect(staffDayState('2026-11-08', today, facts())).toBe('missing');
    expect(staffDayState(today, today, facts())).toBe('waiting');
    expect(staffDayState('2026-11-11', today, facts())).toBe('upcoming');
    // Came in on a day they had reported away: they came.
    expect(staffDayState('2026-11-09', today, facts({ clocked: true, away: true }))).toBe('on_time');
  });

  it('lists a month’s days and the days an absence covers in it', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2026-11').at(-1)).toBe('2026-11-30');
    const away = awayDays([
      { startsOn: '2026-10-30', endsOn: '2026-11-02', cancelled: false },
      { startsOn: '2026-11-20', endsOn: '2026-11-20', cancelled: true },
    ], '2026-11');
    expect([...away]).toEqual(['2026-11-01', '2026-11-02']);
  });

  it('counts the days of each kind', () => {
    const s = summarizeStaffMonth(['on_time', 'late', 'late', 'away', 'missing', 'off', 'upcoming']);
    expect(s).toMatchObject({ worked: 3, late: 2, away: 1, missing: 1, off: 1, upcoming: 1, waiting: 0 });
  });

  it('names every kind of day in both languages', () => {
    for (const dict of [en, ar]) {
      for (const state of STAFF_DAY_STATES) expect(typeof dict.staff.attendance.states[state], state).toBe('string');
      for (const key of ['worked', 'late', 'away', 'missing', 'missingHint'] as const) expect(typeof dict.staff.attendance.stat[key], key).toBe('string');
    }
  });
});
