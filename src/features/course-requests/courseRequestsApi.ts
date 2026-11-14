import { errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

/*
 * Asking to enrol in a course, through the server: the family reads the open courses
 * (course_catalog_for_family), asks (course_request_enrollment) or withdraws (course_request_cancel);
 * the nursery reads a course's requests (under their rules) and answers (course_request_decide).
 */

type Names = { ar: string | null; en: string | null };

/** Where one of the family's children stands in a course. */
export type CatalogChild = { child_id: string; state: 'enrolled' | 'pending' | 'none'; request_id: string | null };

export type CatalogCourse = {
  id: string;
  nursery_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  category: string;
  price_per_month: number;
  schedule_days: string[] | null;
  schedule_time_start: string | null;
  schedule_time_end: string | null;
  starts_on: string | null;
  ends_on: string | null;
  max_students: number | null;
  enrolled: number;
  teacher: Names | null;
  children: CatalogChild[] | null;
};

export type CourseRequest = {
  id: string;
  child_id: string;
  note: string | null;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  child: { full_name_ar: string; full_name_en: string } | null;
  parent: { name_ar: string | null; name_en: string | null; phone: string | null } | null;
};

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

export const fetchCatalog = () => call<CatalogCourse[]>('course_catalog_for_family', {});
export const requestEnrollment = (courseId: string, childId: string, note: string) =>
  call<string>('course_request_enrollment', { p_course_id: courseId, p_child_id: childId, p_note: note.trim() || null });
export const cancelRequest = (requestId: string) => call<null>('course_request_cancel', { p_request_id: requestId });
export const decideRequest = (requestId: string, approve: boolean, note: string) =>
  call<null>('course_request_decide', { p_request_id: requestId, p_approve: approve, p_note: note.trim() || null });

/** A course's requests, the waiting ones first, then the newest. */
export async function fetchCourseRequests(courseId: string): Promise<CourseRequest[]> {
  const { data, error } = await supabase
    .from('course_enrollment_requests' as never)
    .select(
      'id, child_id, note, status, created_at, decided_at, decision_note, child:children(full_name_ar, full_name_en), ' +
        'parent:users!course_enrollment_requests_parent_id_fkey(name_ar, name_en, phone)',
    )
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as CourseRequest[];
  return [...rows.filter((r) => r.status === 'pending'), ...rows.filter((r) => r.status !== 'pending')];
}

/** Why the server refused. */
export const COURSE_REQUEST_ERROR_CODES = [
  'course_forbidden',
  'course_not_open',
  'course_already_enrolled',
  'course_already_requested',
  'course_full',
  'course_note_too_long',
  'course_request_closed',
] as const;

export const courseRequestErrorKey = (error: unknown): string =>
  errorTextKey(error, COURSE_REQUEST_ERROR_CODES, 'courseRequests.errors', 'course_');
