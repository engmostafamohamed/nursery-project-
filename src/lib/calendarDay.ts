/*
 * Calendar days as 'YYYY-MM-DD' strings, worked out in UTC so no time zone or daylight saving moves
 * them. For "today" in the nursery's time zone see nurseryDay.ts.
 */

const toUtc = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);

/** The day `days` days after (or, negative, before) the given one. */
export function addDays(ymd: string, days: number): string {
  const date = toUtc(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
