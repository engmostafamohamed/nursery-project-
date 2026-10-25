// The daily report send rate for the admin and the head of teachers (get_daily_report_stats): one
// report is expected per child who came, per day; how many were sent, on the day or late, and which
// are missing, by teacher, class, day and child.
import type { PillTone } from '@/lib/tones';

export type StatsTotals = {
  expected: number;
  sent: number;
  on_time: number;
  late: number;
  missing: number;
  drafts: number;
  /** null when nothing was expected. */
  rate: number | null;
  on_time_rate: number | null;
  avg_completion: number | null;
};

type Counted = { expected: number; sent: number; on_time: number; missing: number; rate: number | null };

export type StatsByClass = Counted & {
  class_id: string;
  name_ar: string | null;
  name_en: string | null;
  lead_ar: string | null;
  lead_en: string | null;
};

export type StatsByTeacher = Counted & {
  teacher_id: string;
  name_ar: string | null;
  name_en: string | null;
  classes_ar: string | null;
  classes_en: string | null;
  /** Reports this teacher sent themselves (an assistant may send for the lead). */
  sent_by_them: number;
};

export type StatsByDay = { day: string; expected: number; sent: number; on_time: number; rate: number | null };

export type StatsByChild = {
  child_id: string;
  name_ar: string | null;
  name_en: string | null;
  code: string | null;
  class_ar: string | null;
  class_en: string | null;
  expected: number;
  sent: number;
  missing: number;
  rate: number | null;
};

export type StatsMissing = {
  day: string;
  child_id: string;
  name_ar: string | null;
  name_en: string | null;
  code: string | null;
  class_ar: string | null;
  class_en: string | null;
  lead_ar: string | null;
  lead_en: string | null;
  /** none: never started; draft: started, not sent. */
  status: 'none' | 'draft';
  answered: number;
};

export type DailyReportStats = {
  from: string;
  to: string;
  totals: StatsTotals;
  by_class: StatsByClass[];
  by_teacher: StatsByTeacher[];
  by_day: StatsByDay[];
  children: StatsByChild[];
  missing: StatsMissing[];
};

/** Green from 90%, amber from 70%, red below; neutral when nothing was expected. */
export function rateTone(rate: number | null | undefined): PillTone {
  if (rate == null) return 'neutral';
  if (rate >= 90) return 'success';
  if (rate >= 70) return 'warning';
  return 'error';
}

export const pick = (ar: string | null | undefined, en: string | null | undefined, lang: string) =>
  (lang.startsWith('ar') ? ar?.trim() || en?.trim() : en?.trim() || ar?.trim()) || '';

/** Rows whose child name or code (or class, or teacher) contain the search, ignoring case. */
export function searchRows<T extends Partial<Record<'name_ar' | 'name_en' | 'code' | 'class_ar' | 'class_en' | 'lead_ar' | 'lead_en', string | null>>>(
  rows: T[],
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => [r.name_ar, r.name_en, r.code, r.class_ar, r.class_en, r.lead_ar, r.lead_en].some((v) => v?.toLowerCase().includes(q)));
}

export type StatsView = 'teachers' | 'classes' | 'days' | 'children' | 'missing';
