/** Local YYYY-MM-DD (no UTC shift). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfCalendarMonth(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return toLocalDateString(x);
}

/** Rolling 7 days ending today (inclusive). */
export function rollingWeekRangeToToday(): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { from: toLocalDateString(start), to: toLocalDateString(end) };
}

export function calendarMonthRangeToToday(): { from: string; to: string } {
  const end = new Date();
  return { from: startOfCalendarMonth(end), to: toLocalDateString(end) };
}

export function eachDateInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  if (cur > end) return out;
  for (; cur <= end; cur.setDate(cur.getDate() + 1)) {
    out.push(toLocalDateString(cur));
  }
  return out;
}

import { extractPickupSnapshot } from '@/lib/pickupSnapshot';

export function isLatePickupLog(log: unknown): boolean {
  return extractPickupSnapshot(log).isLatePickup;
}

export function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function averageMinutesToTimeLabel(avgMin: number | null, locale: string): string {
  if (avgMin == null || Number.isNaN(avgMin)) return '—';
  const h = Math.floor(avgMin / 60);
  const m = Math.round(avgMin % 60);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
}
