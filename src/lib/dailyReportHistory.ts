// The sent daily reports a teacher can look back on (get_daily_report_history): one day, or a period
// of at most a year, by class and by a child's name or code.
import { addCalendarDaysYmd } from './nurseryDay';

/** One sent report in the history. */
export type DailyReportHistoryRow = {
  report_id: string;
  child_id: string;
  full_name_ar: string | null;
  full_name_en: string | null;
  avatar_url: string | null;
  child_code: string | null;
  class_id: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  report_date: string;
  published_at: string | null;
  sender_name_ar: string | null;
  sender_name_en: string | null;
  mood: string | null;
  /** How many reports match, over every page. */
  total_count: number;
};

export type HistoryMode = 'day' | 'period';

export type HistoryFilters = { mode: HistoryMode; day: string; from: string; to: string; classId: string; search: string };

/** The server's limit on a period. */
export const HISTORY_MAX_DAYS = 366;
/** The server's limit on the search. */
export const HISTORY_SEARCH_MAX = 80;
/** A period opens on the last month. */
export const HISTORY_DEFAULT_DAYS = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultHistoryFilters(today: string): HistoryFilters {
  return { mode: 'period', day: today, from: addCalendarDaysYmd(today, -HISTORY_DEFAULT_DAYS), to: today, classId: '', search: '' };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The period to ask for: the one day, or from–to; null when it is not a valid one (the server would refuse it). */
export function historyRange(filters: Pick<HistoryFilters, 'mode' | 'day' | 'from' | 'to'>): { from: string; to: string } | null {
  if (filters.mode === 'day') return DATE_RE.test(filters.day) ? { from: filters.day, to: filters.day } : null;
  if (!DATE_RE.test(filters.from) || !DATE_RE.test(filters.to)) return null;
  const span = daysBetween(filters.from, filters.to);
  return span >= 0 && span <= HISTORY_MAX_DAYS ? { from: filters.from, to: filters.to } : null;
}

/** Whether the filters narrow the default list (for the "Clear" button). */
export const historyFiltered = (filters: HistoryFilters, today: string) => JSON.stringify(filters) !== JSON.stringify(defaultHistoryFilters(today));
