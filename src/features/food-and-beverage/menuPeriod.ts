/*
 * The menu's days and periods. A menu covers a week (Saturday to Friday) or a calendar month, as the
 * nursery chooses; dates are YYYY-MM-DD strings worked out in UTC, so no time zone shifts them. The
 * database does the same (menu_period_of).
 */
import { addDays } from '@/lib/calendarDay';

import { menuDays, toUtcDate, type MenuPeriod } from '../../../supabase/functions/_shared/menuRules.ts';

export { maxDishes, MENU_PERIODS, openDaysBetween, type MenuPeriod } from '../../../supabase/functions/_shared/menuRules.ts';
export { addDays };

/** The days a loaded menu covers: the server's open days (weekdays less holidays), else its weekdays. */
export function menuOpenDays(menu: { startsOn: string; endsOn: string; workingDays: readonly string[]; openDays: readonly string[] | null }): string[] {
  return menuDays({ starts_on: menu.startsOn, ends_on: menu.endsOn, working_days: menu.workingDays, open_days: menu.openDays });
}

const toYmd = (date: Date) => date.toISOString().slice(0, 10);

/** The Saturday the day's week starts on (weeks run Saturday to Friday, as in the database). */
export function weekStartOf(ymd: string): string {
  return addDays(ymd, -((toUtcDate(ymd).getUTCDay() + 1) % 7));
}

export const monthStartOf = (ymd: string) => `${ymd.slice(0, 7)}-01`;

/** The first and last day of the period a day falls in. */
export function periodBounds(ymd: string, period: MenuPeriod): { startsOn: string; endsOn: string } {
  if (period === 'week') {
    const startsOn = weekStartOf(ymd);
    return { startsOn, endsOn: addDays(startsOn, 6) };
  }
  const startsOn = monthStartOf(ymd);
  return { startsOn, endsOn: addDays(shiftPeriod(startsOn, 'month', 1), -1) };
}

/** The first day of the period `steps` periods away (negative goes back). */
export function shiftPeriod(startsOn: string, period: MenuPeriod, steps: number): string {
  if (period === 'week') return addDays(weekStartOf(startsOn), 7 * steps);
  const date = toUtcDate(monthStartOf(startsOn));
  date.setUTCMonth(date.getUTCMonth() + steps);
  return toYmd(date);
}

/**
 * The day a menu link asks for: ?day= (any day of the period), or ?week= from links sent before
 * menus could be monthly. Null when neither is a date.
 */
export function requestedMenuDay(params: Pick<URLSearchParams, 'get'>): string | null {
  return [params.get('day'), params.get('week')].find((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))) ?? null;
}

/** The period's open days in weeks (Saturday to Friday), for laying a month out week by week. */
export function weeksOf(days: string[]): Array<{ weekStart: string; days: string[] }> {
  const weeks = new Map<string, string[]>();
  for (const day of days) {
    const start = weekStartOf(day);
    weeks.set(start, [...(weeks.get(start) ?? []), day]);
  }
  return [...weeks].map(([weekStart, list]) => ({ weekStart, days: list }));
}
