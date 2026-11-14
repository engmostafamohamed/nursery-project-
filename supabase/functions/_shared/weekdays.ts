// A nursery's weekdays (nurseries.working_days), read the same way everywhere: in the app, in the
// edge functions and in SQL (attendance_is_school_day). They were stored in several ways over time —
// ['sun', 'mon'], ['0', '1'], [0, 1] or ['Sunday'] — so every reader goes through here.

/** 0 = Sunday … 6 = Saturday, as JavaScript's getUTCDay() and Postgres' extract(dow). */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** What the server assumes when a nursery has none stored: Sunday to Thursday. */
export const DEFAULT_OPEN_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];

const FULL_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** One stored weekday as 0–6, or null when it is not one. */
export function weekdayNumber(value: unknown): number | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === '') return null;
  const short = WEEKDAY_KEYS.indexOf(raw as WeekdayKey);
  if (short >= 0) return short;
  const full = FULL_NAMES.indexOf(raw);
  if (full >= 0) return full;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}

/** The stored weekdays as 0–6 in week order, without repeats (empty when none are usable). */
export function weekdayNumbers(stored: unknown): number[] {
  if (!Array.isArray(stored)) return [];
  const days = new Set(stored.map(weekdayNumber).filter((d): d is number => d !== null));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => days.has(d));
}

/** The weekdays the nursery opens, with the server's default when none are stored. */
export function openWeekdays(stored: unknown): number[] {
  const days = weekdayNumbers(stored);
  return days.length ? days : [...DEFAULT_OPEN_WEEKDAYS];
}
