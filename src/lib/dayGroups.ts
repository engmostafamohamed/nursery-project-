/** Local calendar day "YYYY-MM-DD" of an ISO timestamp, a Date, or a plain day (returned as is). */
export function localDayKey(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Items grouped by local day, groups in the order their first item appears. */
export function groupByDay<T>(items: T[], dateOf: (item: T) => string): Array<{ key: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = localDayKey(dateOf(item));
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }));
}

/** "Today", "Yesterday", or the full date for a day key. */
export function dayHeading(key: string, locale: string, labels: { today: string; yesterday: string }, now = new Date()): string {
  if (!key) return '';
  if (key === localDayKey(now)) return labels.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday)) return labels.yesterday;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
