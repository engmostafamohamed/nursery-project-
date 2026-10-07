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

/** Minutes the nursery timezone is ahead of UTC at a given moment (Egypt: 120, or 180 in summer time). */
function nurseryZoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NURSERY_CALENDAR_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The moment (ISO, UTC) a nursery calendar day YYYY-MM-DD starts, for filtering timestamps by
 * nursery day or month: a payment at 01:00 Cairo on the 1st belongs to the new month.
 */
export function nurseryDayStartIso(isoYmd: string): string {
  const [y, m, d] = isoYmd.split('-').map(Number);
  const utcMidnight = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return new Date(utcMidnight - nurseryZoneOffsetMinutes(new Date(utcMidnight)) * 60_000).toISOString();
}
