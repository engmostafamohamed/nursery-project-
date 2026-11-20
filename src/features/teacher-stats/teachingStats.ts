/*
 * What a teacher's own classes have been doing lately, as plain data (no React, no network):
 * her classes and their size, a fortnight of attendance and of the day's reports.
 */
import { count, list, obj, text, textOrNull } from '@/lib/jsonRead';

export type TeachingClass = {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  role: string;
  children: number;
};

export type AttendancePoint = { day: string; here: number; away: number };
export type ReportPoint = { day: string; sent: number; draft: number };

export type TeachingStats = {
  from: string;
  to: string;
  classes: TeachingClass[];
  attendance: AttendancePoint[];
  reports: ReportPoint[];
  totals: { children: number; classes: number; reportsSent: number; daysRecorded: number };
};

export function toTeachingStats(raw: unknown): TeachingStats {
  const o = obj(raw);
  const totals = obj(o.totals);
  return {
    from: text(o.from),
    to: text(o.to),
    classes: list(o.classes).map((c) => ({
      id: text(c.id),
      nameAr: textOrNull(c.ar),
      nameEn: textOrNull(c.en),
      role: text(c.role),
      children: count(c.children),
    })),
    attendance: list(o.attendance).map((p) => ({ day: text(p.day), here: count(p.here), away: Math.max(0, count(p.away)) })),
    reports: list(o.reports).map((p) => ({ day: text(p.day), sent: count(p.sent), draft: count(p.draft) })),
    totals: {
      children: count(totals.children),
      classes: count(totals.classes),
      reportsSent: count(totals.reports_sent),
      daysRecorded: count(totals.days_recorded),
    },
  };
}

/**
 * How many of the children expected were there, across the fortnight, as a whole percentage —
 * null while no day has been recorded, so the figure is never a misleading zero.
 */
export function attendanceRate(stats: TeachingStats | null | undefined): number | null {
  const points = stats?.attendance ?? [];
  if (!points.length) return null;
  const here = points.reduce((sum, p) => sum + p.here, 0);
  const expected = points.reduce((sum, p) => sum + p.here + p.away, 0);
  if (expected <= 0) return null;
  return Math.round((here / expected) * 100);
}

/** The busiest class she teaches, or null when she is on none. */
export function biggestClass(stats: TeachingStats | null | undefined): TeachingClass | null {
  const classes = stats?.classes ?? [];
  if (!classes.length) return null;
  return classes.reduce((best, c) => (c.children > best.children ? c : best), classes[0]!);
}
