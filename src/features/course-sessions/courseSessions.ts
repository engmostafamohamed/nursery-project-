/*
 * A course's sessions as plain data and rules (no React, no network). A child's course time is not
 * charged as extra hours; when a session is cancelled, the children who stay at the nursery during
 * it are charged that time as extra time, and their parents are told at the end of the day with the
 * reason. The database (get_course_sessions, cancel_course_session) makes the same checks.
 */
import { addDays } from '@/lib/calendarDay';

/** The longest reason (cancel_course_session's limit). */
export const REASON_MAX = 300;
/** The sessions the panel lists: the past week (to record a cancellation after the fact) and the next four weeks. */
export const LIST_DAYS_BACK = 7;
export const LIST_DAYS_AHEAD = 28;

export type NamePair = { ar: string; en: string };

export type CourseSession = {
  date: string;
  cancelled: boolean;
  reason: string | null;
  cancelledAt: string | null;
  cancelledBy: NamePair | null;
};

export type CourseSessions = {
  /** The nursery's today. */
  today: string;
  /** The days a session may be cancelled or restored (the server decides; shown as given). */
  changeFrom: string;
  changeTo: string;
  timeStart: string | null;
  timeEnd: string | null;
  sessions: CourseSession[];
};

/** What cancelling or restoring did beyond the session: days billed again, children's families told. */
export type SessionChange = { rebilled: number; notified: number };

/** The notes to show after a change, each with its count (families told first). */
export function changeNotes(change: SessionChange): Array<{ key: 'courseSessions.notified' | 'courseSessions.rebilled'; count: number }> {
  return [
    ...(change.notified > 0 ? [{ key: 'courseSessions.notified' as const, count: change.notified }] : []),
    ...(change.rebilled > 0 ? [{ key: 'courseSessions.rebilled' as const, count: change.rebilled }] : []),
  ];
}

export type ReasonIssue = 'required' | 'too_long';

export function reasonIssue(reason: string): ReasonIssue | null {
  const value = reason.trim();
  if (!value) return 'required';
  if (value.length > REASON_MAX) return 'too_long';
  return null;
}

/** The days to list around today. */
export const listRange = (today: string) => ({ from: addDays(today, -LIST_DAYS_BACK), to: addDays(today, LIST_DAYS_AHEAD) });

/** Whether a session may still be cancelled or restored. */
export const canChange = (date: string, window: Pick<CourseSessions, 'changeFrom' | 'changeTo'>) =>
  date >= window.changeFrom && date <= window.changeTo;

/** The sessions to come (today first) and the past ones (the latest first). */
export function splitSessions(sessions: CourseSession[], today: string): { upcoming: CourseSession[]; past: CourseSession[] } {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  return {
    upcoming: sorted.filter((s) => s.date >= today),
    past: sorted.filter((s) => s.date < today).reverse(),
  };
}

/** The course's time as "14:30–15:30", or the one end that is known. */
export function sessionTime(start: string | null, end: string | null): string {
  const trim = (value: string | null) => value?.trim().slice(0, 5) ?? '';
  return [trim(start), trim(end)].filter(Boolean).join('–');
}
