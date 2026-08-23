import { parseWeeklyHours } from '@/features/staff-onboarding/mapStaffOnboardingToProfile';

function timeToMinutes(t: string): number {
  const p = t.trim();
  const [h, m] = p.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function isEndTimeAfterStart(start: string, end: string): boolean {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b > a;
}

/** Weekly hours must be > 0 and ≤ 60 (Egypt cap). */
export function isWeeklyHoursValid(start: string, end: string, workingDayCount: number): boolean {
  if (workingDayCount < 1 || workingDayCount > 6) return false;
  if (!isEndTimeAfterStart(start, end)) return false;
  const weekly = parseWeeklyHours(start, end, workingDayCount);
  return weekly > 0 && weekly <= 60;
}
