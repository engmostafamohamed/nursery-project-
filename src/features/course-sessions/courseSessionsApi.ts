import { errorTextKey } from '@/lib/errorCode';
import { count, day, list, obj, text, textOrNull, type JsonRecord } from '@/lib/jsonRead';
import { supabase } from '@/lib/supabase';

import type { CourseSessions, NamePair, SessionChange } from './courseSessions';

/*
 * A course's sessions through get_course_sessions, cancel_course_session and
 * restore_course_session (the nursery's admins and the course's teacher). Cancelling or restoring
 * bills the day again on the server; the end-of-day notice to the parents is sent from there too.
 */

const namePair = (value: unknown): NamePair | null =>
  value && typeof value === 'object' ? { ar: text(obj(value).ar), en: text(obj(value).en) } : null;

export function toCourseSessions(row: JsonRecord): CourseSessions {
  return {
    today: day(row.today),
    changeFrom: day(row.change_from),
    changeTo: day(row.change_to),
    timeStart: textOrNull(row.time_start),
    timeEnd: textOrNull(row.time_end),
    sessions: list(row.sessions).map((s) => ({
      date: day(s.date),
      cancelled: s.cancelled === true,
      reason: textOrNull(s.reason),
      cancelledAt: textOrNull(s.cancelled_at),
      cancelledBy: namePair(s.cancelled_by),
    })),
  };
}

export async function fetchCourseSessions(courseId: string, from: string, to: string): Promise<CourseSessions> {
  const { data, error } = await supabase.rpc('get_course_sessions' as never, { p_course_id: courseId, p_from: from, p_to: to } as never);
  if (error) throw error;
  return toCourseSessions(obj(data));
}

/** What a cancel or restore did beyond the session (cancel_course_session / restore_course_session). */
export const toSessionChange = (data: unknown): SessionChange => ({ rebilled: count(obj(data).rebilled), notified: count(obj(data).notified) });

export async function cancelCourseSession(input: { courseId: string; date: string; reason: string }): Promise<SessionChange> {
  const { data, error } = await supabase.rpc('cancel_course_session' as never, {
    p_course_id: input.courseId,
    p_day: input.date,
    p_reason: input.reason.trim(),
  } as never);
  if (error) throw error;
  return toSessionChange(data);
}

export async function restoreCourseSession(input: { courseId: string; date: string }): Promise<SessionChange> {
  const { data, error } = await supabase.rpc('restore_course_session' as never, { p_course_id: input.courseId, p_day: input.date } as never);
  if (error) throw error;
  return toSessionChange(data);
}

export const COURSE_SESSION_ERROR_CODES = [
  'course_forbidden',
  'course_session_invalid_range',
  'course_session_out_of_window',
  'course_session_reason_required',
  'course_session_reason_too_long',
  'course_session_not_scheduled',
] as const;

/** The text key for a refused call (courseSessions.errors.<code>, network, failed). */
export const courseSessionErrorKey = (error: unknown): string => errorTextKey(error, COURSE_SESSION_ERROR_CODES, 'courseSessions.errors');
