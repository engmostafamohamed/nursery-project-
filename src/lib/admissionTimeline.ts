// A child's admission journey with the exact time of each step: the application started,
// submitted by the parent, payment confirmed, approved (and by whom), joined the nursery and the
// first day at the nursery. From get_admission_timelines, for the staff and the family alike.
import { formatDate, formatDateTime } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';

export type AdmissionTimeline = {
  childId: string;
  applicationId: string | null;
  applicationStartedAt: string | null;
  submittedAt: string | null;
  paymentConfirmedAt: string | null;
  approvedAt: string | null;
  approvedBy: { ar: string | null; en: string | null };
  /** The official enrollment day (no time). */
  enrollmentDate: string | null;
  /** The moment the child joined, when known (an approval creates the child and enrolls it at once). */
  joinedAt: string | null;
  /** The first check-in: the first day the child actually came. */
  firstCheckIn: string | null;
};

type TimelineRow = {
  child_id: string;
  application_id: string | null;
  application_started_at: string | null;
  submitted_at: string | null;
  payment_confirmed_at: string | null;
  approved_at: string | null;
  approved_by_ar: string | null;
  approved_by_en: string | null;
  enrollment_date: string | null;
  joined_at: string | null;
  first_check_in: string | null;
};

/** The server reads up to 200 children per call. */
const PER_CALL = 200;

export async function fetchAdmissionTimelines(childIds: string[]): Promise<AdmissionTimeline[]> {
  const rows: TimelineRow[] = [];
  for (let i = 0; i < childIds.length; i += PER_CALL) {
    const { data, error } = await supabase.rpc('get_admission_timelines' as never, { p_child_ids: childIds.slice(i, i + PER_CALL) } as never);
    if (error) throw error;
    rows.push(...((data ?? []) as TimelineRow[]));
  }
  return rows.map((row) => ({
    childId: row.child_id,
    applicationId: row.application_id,
    applicationStartedAt: row.application_started_at,
    submittedAt: row.submitted_at,
    paymentConfirmedAt: row.payment_confirmed_at,
    approvedAt: row.approved_at,
    approvedBy: { ar: row.approved_by_ar, en: row.approved_by_en },
    enrollmentDate: row.enrollment_date,
    joinedAt: row.joined_at,
    firstCheckIn: row.first_check_in,
  }));
}

export type AdmissionStepKey = 'started' | 'submitted' | 'paid' | 'approved' | 'joined' | 'firstDay';

export type AdmissionStep = {
  key: AdmissionStepKey;
  /** When it happened (date and time); null while it has not happened or is not known. */
  at: string | null;
  /** A day without a time, when only the day is known (an enrollment date set by hand). */
  day: string | null;
};

/**
 * The steps in order. A child added directly by the nursery has no application steps; a child
 * from an application shows every step, the ones not reached yet without a time.
 */
export function admissionSteps(timeline: AdmissionTimeline): AdmissionStep[] {
  const joined: AdmissionStep = { key: 'joined', at: timeline.joinedAt, day: timeline.joinedAt ? null : timeline.enrollmentDate };
  const firstDay: AdmissionStep = { key: 'firstDay', at: timeline.firstCheckIn, day: null };
  if (!timeline.applicationId) return [joined, firstDay];
  return [
    { key: 'started', at: timeline.applicationStartedAt, day: null },
    { key: 'submitted', at: timeline.submittedAt, day: null },
    { key: 'paid', at: timeline.paymentConfirmedAt, day: null },
    { key: 'approved', at: timeline.approvedAt, day: null },
    joined,
    firstDay,
  ];
}

/** Whole minutes from one moment to a later one; null when either is missing or out of order. */
export function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null;
}

/** "Wed, 21 Oct 2026, 8:52 am": the format every step uses. */
export const STEP_DATE_TIME: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
};

export const STEP_DATE: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

/** When the child joined: the date and time, or only the date when that is all that is known. */
export function joinedWhenText(timeline: AdmissionTimeline): string {
  if (timeline.joinedAt) return formatDateTime(timeline.joinedAt, STEP_DATE_TIME);
  if (timeline.enrollmentDate) return formatDate(`${timeline.enrollmentDate}T12:00:00`, STEP_DATE);
  return '—';
}
