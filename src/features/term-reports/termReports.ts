import type { ParentQuarterlyReport } from '@/hooks/useQuarterlyReports';

/** Days present of the days counted, as a whole percent; null when the report has no attendance. */
export function attendanceRate(present: number | null, total: number | null): number | null {
  if (present == null || !total) return null;
  return Math.round((Math.min(present, total) / total) * 100);
}

/** How many of the report's items were graded, of all its items. */
export function gradedCount(r: ParentQuarterlyReport): { graded: number; items: number } {
  const ids = r.template.sections.flatMap((s) => s.items.map((i) => i.id));
  return { graded: ids.filter((id) => r.grades[id]).length, items: ids.length };
}

/** The report to show: the one asked for (a notice's ?report=), else the newest. */
export function pickReport(reports: ParentQuarterlyReport[], wanted: string | null): ParentQuarterlyReport | undefined {
  return reports.find((r) => r.report.id === wanted) ?? reports[0];
}
