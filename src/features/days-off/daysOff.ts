/*
 * The nursery's days off: the weekdays it closes and its holidays (a day or a range). The server
 * keeps them (nurseries.working_days, nursery_holidays) and every screen asks it whether a day is
 * open; these are the plain rules the settings page shows and checks before saving.
 */

export type HolidaySource = 'custom' | 'official';

export type Holiday = {
  id: string;
  nursery_id: string;
  name_ar: string | null;
  name_en: string | null;
  starts_on: string;
  ends_on: string;
  source: HolidaySource;
  official_key: string | null;
  notified_at: string | null;
};

/** A holiday being added or changed. */
export type HolidayDraft = { nameAr: string; nameEn: string; startsOn: string; endsOn: string };

export const HOLIDAY_NAME_MAX = 80;
/** The longest holiday, in days after its first (the server checks the same). */
export const HOLIDAY_MAX_SPAN = 60;

const DAY_MS = 86_400_000;
const time = (ymd: string) => Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`);

/** How many days a holiday lasts, both ends included. */
export const holidayLength = (h: { starts_on: string; ends_on: string }) => Math.round((time(h.ends_on) - time(h.starts_on)) / DAY_MS) + 1;

/** The holidays touching a calendar year, in date order. */
export const holidaysOfYear = (holidays: readonly Holiday[], year: number) =>
  holidays
    .filter((h) => h.starts_on <= `${year}-12-31` && h.ends_on >= `${year}-01-01`)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));

/** Where a holiday stands against today. */
export const holidayState = (h: { starts_on: string; ends_on: string }, today: string): 'past' | 'now' | 'coming' =>
  h.ends_on < today ? 'past' : h.starts_on <= today ? 'now' : 'coming';

/** The next day off (one going on now first), or null. */
export const nextHoliday = (holidays: readonly Holiday[], today: string) =>
  [...holidays].filter((h) => h.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null;

export type HolidayProblem = 'nameRequired' | 'nameTooLong' | 'datesRequired' | 'datesInvalid' | 'tooLong';

/** What is wrong with a draft, by field (empty when it can be saved). */
export function holidayProblems(d: HolidayDraft): Partial<Record<'name' | 'dates', HolidayProblem>> {
  const problems: Partial<Record<'name' | 'dates', HolidayProblem>> = {};
  if (!d.nameAr.trim() && !d.nameEn.trim()) problems.name = 'nameRequired';
  else if (Math.max(d.nameAr.trim().length, d.nameEn.trim().length) > HOLIDAY_NAME_MAX) problems.name = 'nameTooLong';
  const end = d.endsOn || d.startsOn;
  if (!d.startsOn) problems.dates = 'datesRequired';
  else if (end < d.startsOn) problems.dates = 'datesInvalid';
  else if (holidayLength({ starts_on: d.startsOn, ends_on: end }) - 1 > HOLIDAY_MAX_SPAN) problems.dates = 'tooLong';
  return problems;
}

/** The arguments nursery_holiday_save takes. */
export const holidayArgs = (d: HolidayDraft, nurseryId: string) => ({
  nursery_id: nurseryId,
  name_ar: d.nameAr.trim() || null,
  name_en: d.nameEn.trim() || null,
  starts_on: d.startsOn,
  ends_on: d.endsOn || d.startsOn,
});

export const emptyHolidayDraft = (today: string): HolidayDraft => ({ nameAr: '', nameEn: '', startsOn: today, endsOn: today });

export const holidayDraftOf = (h: Holiday): HolidayDraft => ({
  nameAr: h.name_ar ?? '',
  nameEn: h.name_en ?? '',
  startsOn: h.starts_on,
  endsOn: h.ends_on,
});

/** Weekdays in the order the settings page shows them: Sunday first, as the rest of the app and the notices. */
export const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

const addDays = (ymd: string, days: number) => new Date(time(ymd) + days * DAY_MS).toISOString().slice(0, 10);

/** A day of the given weekday (0 = Sunday), to print the weekday's name. */
export const weekdayDate = (weekday: number) => addDays('2026-11-15', weekday); // a Sunday

/*
 * What may still change (the server checks the same): an ended day off stays as it is; a running
 * one keeps its first day and can end early (yesterday at the soonest, so the nursery opens today);
 * only one that has not started can be removed.
 */
export const canChangeHoliday = (h: { ends_on: string }, today: string) => h.ends_on >= today;
export const canRemoveHoliday = (h: { starts_on: string }, today: string) => h.starts_on >= today;
export const earliestEnd = (h: { starts_on: string }, today: string) => (h.starts_on < today ? addDays(today, -1) : h.starts_on);

export type DayOff = { day: string; holiday: Holiday | null };

/** The next day the nursery is closed from today (within a month): a holiday or a weekly day off. */
export function nextDayOff(today: string, openWeekdays: readonly number[], holidays: readonly Holiday[]): DayOff | null {
  for (let i = 0; i <= 31; i += 1) {
    const day = addDays(today, i);
    const holiday = holidays.find((h) => h.starts_on <= day && day <= h.ends_on) ?? null;
    if (holiday) return { day, holiday };
    if (!openWeekdays.includes(new Date(time(day)).getUTCDay())) return { day, holiday: null };
  }
  return null;
}
