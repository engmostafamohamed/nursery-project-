import { describe, expect, it } from 'vitest';

import { addDays, maxDishes, menuOpenDays, openDaysBetween, periodBounds, requestedMenuDay, shiftPeriod, weeksOf, weekStartOf } from './menuPeriod';

describe('menu days', () => {
  it('a week runs Saturday to Friday, from any day of it', () => {
    expect(weekStartOf('2026-11-07')).toBe('2026-11-07'); // a Saturday
    expect(weekStartOf('2026-11-08')).toBe('2026-11-07'); // Sunday
    expect(weekStartOf('2026-11-13')).toBe('2026-11-07'); // Friday
    expect(weekStartOf('2026-11-14')).toBe('2026-11-14');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-26'); // across the year
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('are the days the nursery is open, Sunday to Thursday when it has not said', () => {
    expect(openDaysBetween('2026-11-07', '2026-11-13', ['sun', 'mon', 'tue', 'wed', 'thu'])).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
    expect(openDaysBetween('2026-11-07', '2026-11-13', ['sat', 'sun'])).toEqual(['2026-11-07', '2026-11-08']);
    expect(openDaysBetween('2026-11-07', '2026-11-13', [])).toHaveLength(5);
    expect(openDaysBetween('2026-11-01', '2026-11-30', [])).toHaveLength(22); // November 2026 starts on a Sunday
    // stored as numbers by the XO forms
    expect(openDaysBetween('2026-11-07', '2026-11-13', ['6', '0'])).toEqual(['2026-11-07', '2026-11-08']);
  });

  it("are the server's open days when it sends them (its weekdays less its holidays)", () => {
    const menu = { startsOn: '2026-11-07', endsOn: '2026-11-13', workingDays: ['sun', 'mon', 'tue', 'wed', 'thu'] };
    expect(menuOpenDays({ ...menu, openDays: ['2026-11-08', '2026-11-10'] })).toEqual(['2026-11-08', '2026-11-10']);
    expect(menuOpenDays({ ...menu, openDays: [] })).toEqual([]); // a whole week off
    expect(menuOpenDays({ ...menu, openDays: null })).toHaveLength(5); // an older server
  });
});

describe('the menu period', () => {
  it('is the week or the calendar month a day falls in', () => {
    expect(periodBounds('2026-11-10', 'week')).toEqual({ startsOn: '2026-11-07', endsOn: '2026-11-13' });
    expect(periodBounds('2026-11-10', 'month')).toEqual({ startsOn: '2026-11-01', endsOn: '2026-11-30' });
    expect(periodBounds('2028-02-14', 'month')).toEqual({ startsOn: '2028-02-01', endsOn: '2028-02-29' }); // a leap year
    expect(periodBounds('2026-12-31', 'month')).toEqual({ startsOn: '2026-12-01', endsOn: '2026-12-31' });
  });

  it('moves by whole weeks or months, landing on the first day', () => {
    expect(shiftPeriod('2026-11-07', 'week', 1)).toBe('2026-11-14');
    expect(shiftPeriod('2026-11-10', 'week', -1)).toBe('2026-10-31');
    expect(shiftPeriod('2026-11-01', 'month', 1)).toBe('2026-12-01');
    expect(shiftPeriod('2026-12-01', 'month', 1)).toBe('2027-01-01');
    expect(shiftPeriod('2026-01-31', 'month', -1)).toBe('2025-12-01');
  });

  it('holds up to 100 dishes for a week and 500 for a month, as save_menu_period', () => {
    expect(maxDishes('week')).toBe(100);
    expect(maxDishes('month')).toBe(500);
  });

  it('lays a month out week by week', () => {
    const weeks = weeksOf(openDaysBetween('2026-11-01', '2026-11-30', []));
    expect(weeks.map((w) => [w.weekStart, w.days.length])).toEqual([
      ['2026-10-31', 5],
      ['2026-11-07', 5],
      ['2026-11-14', 5],
      ['2026-11-21', 5],
      ['2026-11-28', 2], // Sunday 29 and Monday 30
    ]);
  });

  it('opens on the day a link asks for, from ?day= or the older ?week=', () => {
    expect(requestedMenuDay(new URLSearchParams('day=2026-11-20'))).toBe('2026-11-20');
    expect(requestedMenuDay(new URLSearchParams('week=2026-11-07'))).toBe('2026-11-07');
    expect(requestedMenuDay(new URLSearchParams('day=tomorrow'))).toBeNull();
    expect(requestedMenuDay(new URLSearchParams(''))).toBeNull();
  });
});
