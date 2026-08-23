/** Egypt nursery calendar (market default). Keeps dashboard attendance aligned with DB dates seeded in Cairo. */
export const NURSERY_CALENDAR_TIMEZONE = 'Africa/Cairo';

/**
 * Today's calendar date YYYY-MM-DD in the nursery timezone (not the browser's local zone).
 */
export function getNurseryCalendarDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NURSERY_CALENDAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) {
    const x = new Date(date);
    const yy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
  return `${y}-${m}-${d}`;
}

/** Pure calendar add for YYYY-MM-DD (Egypt has no DST; safe for date-only keys). */
export function addCalendarDaysYmd(isoYmd: string, deltaDays: number): string {
  const [ys, ms, ds] = isoYmd.split('-');
  const y = parseInt(ys ?? '0', 10);
  const mo = parseInt(ms ?? '0', 10);
  const day = parseInt(ds ?? '0', 10);
  const t = Date.UTC(y, mo - 1, day);
  const next = new Date(t + deltaDays * 86400000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
