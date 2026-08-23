/** Local calendar date key YYYY-MM-DD (no UTC shift for display bucketing). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateKeyFromIso(iso: string): string {
  return toLocalDateKey(new Date(iso));
}

export function weekdayShortHeaders(locale: string): string[] {
  const sunday = new Date(2024, 0, 7);
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(sunday.getTime() + i * 86400000)));
}

export function eventsInMonth<T extends { starts_at: string }>(events: T[], year: number, monthIndex: number): T[] {
  return events.filter((e) => {
    const d = new Date(e.starts_at);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  });
}

export function buildMonthGrid(year: number, monthIndex: number): ({ day: number } | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  return cells.slice(0, 42);
}

export function categoryDotClass(category: string): string {
  switch (category) {
    case 'trip':
      return 'bg-primary';
    case 'activity':
      return 'bg-info';
    case 'service':
      return 'bg-accent';
    case 'doctor_visit':
      return 'bg-success';
    default:
      return 'bg-on-surface-variant';
  }
}
