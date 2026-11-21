/*
 * The shape of one day of children's attendance, as plain data (no React, no network): how each
 * class stands, and the hours the children arrived in.
 *
 * Both are worked out from the rows the day's table already holds, so the charts cost no second
 * read and can never disagree with the table under them. The span's trends are a different question
 * and belong to the analytics screen; this is the day itself.
 */

export type DayRow = {
  classId: string | null;
  status: 'present' | 'partial' | 'absent' | 'excused' | string;
  checkIn: string | null;
};

export type ClassBar = { id: string; name: string; here: number; absent: number; excused: number };

/** How each class stands on the day, the fullest first. A class with nobody in it is left out. */
export function classBreakdown(rows: DayRow[], nameOf: (classId: string) => string, noClassLabel: string): ClassBar[] {
  const byClass = new Map<string, ClassBar>();
  for (const row of rows) {
    const id = row.classId ?? '';
    let bar = byClass.get(id);
    if (!bar) {
      bar = { id, name: id ? nameOf(id) || noClassLabel : noClassLabel, here: 0, absent: 0, excused: 0 };
      byClass.set(id, bar);
    }
    if (row.status === 'present' || row.status === 'partial') bar.here += 1;
    else if (row.status === 'excused') bar.excused += 1;
    else if (row.status === 'absent') bar.absent += 1;
  }
  return [...byClass.values()]
    .filter((b) => b.here + b.absent + b.excused > 0)
    .sort((a, b) => b.here - a.here || a.name.localeCompare(b.name));
}

export type ArrivalBar = { hour: number; label: string; count: number };

/**
 * The children who arrived in each hour of the day, from the first arrival to the last, in the
 * nursery's own clock. Empty hours between two arrivals are kept, so a quiet stretch shows as the
 * gap it was rather than closing up.
 */
export function arrivalHistogram(rows: DayRow[], timeZone: string): ArrivalBar[] {
  const byHour = new Map<number, number>();
  for (const row of rows) {
    if (!row.checkIn) continue;
    const hour = hourIn(row.checkIn, timeZone);
    if (hour == null) continue;
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  if (!byHour.size) return [];
  const hours = [...byHour.keys()].sort((a, b) => a - b);
  const out: ArrivalBar[] = [];
  for (let h = hours[0] as number; h <= (hours[hours.length - 1] as number); h += 1) {
    out.push({ hour: h, label: `${String(h).padStart(2, '0')}:00`, count: byHour.get(h) ?? 0 });
  }
  return out;
}

/** The hour of a moment on a clock in `timeZone`, or null when it is no moment at all. */
export function hourIn(iso: string, timeZone: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(d);
  const n = Number(hour);
  return Number.isFinite(n) ? n : null;
}

/** The busiest hour of arrivals, for the line under the chart. */
export function busiestHour(bars: ArrivalBar[]): ArrivalBar | null {
  return bars.reduce<ArrivalBar | null>((best, bar) => (!best || bar.count > best.count ? bar : best), null);
}
