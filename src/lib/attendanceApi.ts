import { API_MAX_ROWS } from '@/lib/fetchAllRows';
import { supabase } from '@/lib/supabase';

/**
 * Client side of the attendance server functions (migration 20261006000000). Every check-in,
 * check-out, correction and waiver goes through these RPCs so the server records who did it,
 * writes the audit event, bills extra hours and notifies parents in one transaction.
 */

export type AttendanceMethod = 'qr_parent' | 'qr_custom' | 'manual';

export type AttendanceDayStatus =
  | 'present'
  | 'partial'
  | 'absent'
  | 'excused'
  | 'off'
  | 'holiday'
  | 'upcoming'
  | 'not_enrolled';

export type AttendanceDay = {
  childId: string;
  date: string;
  status: AttendanceDayStatus;
  attendanceId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  checkInMethod: AttendanceMethod | null;
  checkOutMethod: AttendanceMethod | null;
  checkedInBy: { ar: string | null; en: string | null };
  checkedOutBy: { ar: string | null; en: string | null };
  pickupPersonName: string | null;
  pickupRelationship: string | null;
  pickupPhotoUrl: string | null;
  earlyMinutes: number;
  lateMinutes: number;
  extraHours: number;
  extraHoursCovered: number;
  extraHoursBilled: number;
  extraFee: number;
  lateChargeStatus: 'none' | 'provisional' | 'final' | null;
  lateChargeWaived: boolean;
  invoiceId: string | null;
  invoiceStatus: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  absenceReason: string | null;
  absenceNote: string | null;
};

/** Statuses that count as a day the child was expected (present, partly present, absent or excused). */
export const EXPECTED_DAY_STATUSES: ReadonlySet<AttendanceDayStatus> = new Set(['present', 'partial', 'absent', 'excused']);

type AttendanceDayRow = {
  child_id: string;
  day: string;
  day_status: AttendanceDayStatus;
  attendance_id: string | null;
  check_in: string | null;
  check_out: string | null;
  check_in_method: AttendanceMethod | null;
  check_out_method: AttendanceMethod | null;
  checked_in_by_ar: string | null;
  checked_in_by_en: string | null;
  checked_out_by_ar: string | null;
  checked_out_by_en: string | null;
  pickup_person_name: string | null;
  pickup_relationship: string | null;
  pickup_photo_url: string | null;
  early_minutes: number | null;
  late_minutes: number | null;
  extra_hours: number | string | null;
  extra_hours_covered: number | string | null;
  extra_hours_billed: number | string | null;
  extra_fee: number | string | null;
  late_charge_status: AttendanceDay['lateChargeStatus'];
  late_charge_waived: boolean | null;
  invoice_id: string | null;
  invoice_status: string | null;
  needs_review: boolean | null;
  review_reason: string | null;
  absence_reason: string | null;
  absence_note: string | null;
};

const num = (value: number | string | null | undefined) => {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? Number(n) : 0;
};

const PARALLEL_DAY_REQUESTS = 4;

function daysInclusive(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) + 1 : 1;
}

/** One row per child per day (newest first) from get_attendance_days. */
export async function fetchAttendanceDays(childIds: string[], from: string, to: string): Promise<AttendanceDay[]> {
  if (!childIds.length) return [];
  // The function returns one row per child per day and the API cuts a response off at
  // API_MAX_ROWS, so ask for a few children at a time (e.g. 10 children for a 92-day range).
  const perRequest = Math.max(1, Math.floor(API_MAX_ROWS / Math.max(1, daysInclusive(from, to))));
  const chunks: string[][] = [];
  for (let i = 0; i < childIds.length; i += perRequest) chunks.push(childIds.slice(i, i + perRequest));

  const rows: AttendanceDayRow[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_DAY_REQUESTS) {
    const parts = await Promise.all(
      chunks.slice(i, i + PARALLEL_DAY_REQUESTS).map(async (ids) => {
        const { data, error } = await supabase.rpc('get_attendance_days' as never, {
          p_child_ids: ids,
          p_from: from,
          p_to: to,
        } as never);
        if (error) throw error;
        return (data ?? []) as AttendanceDayRow[];
      }),
    );
    for (const part of parts) rows.push(...part);
  }
  // Same order as a single call: newest day first, then child.
  if (chunks.length > 1) {
    rows.sort((a, b) => (a.day === b.day ? (a.child_id < b.child_id ? -1 : a.child_id > b.child_id ? 1 : 0) : a.day < b.day ? 1 : -1));
  }

  return rows.map((row) => ({
    childId: row.child_id,
    date: row.day,
    status: row.day_status,
    attendanceId: row.attendance_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    checkInMethod: row.check_in_method,
    checkOutMethod: row.check_out_method,
    checkedInBy: { ar: row.checked_in_by_ar, en: row.checked_in_by_en },
    checkedOutBy: { ar: row.checked_out_by_ar, en: row.checked_out_by_en },
    pickupPersonName: row.pickup_person_name,
    pickupRelationship: row.pickup_relationship,
    pickupPhotoUrl: row.pickup_photo_url,
    earlyMinutes: num(row.early_minutes),
    lateMinutes: num(row.late_minutes),
    extraHours: num(row.extra_hours),
    extraHoursCovered: num(row.extra_hours_covered),
    extraHoursBilled: num(row.extra_hours_billed),
    extraFee: num(row.extra_fee),
    lateChargeStatus: row.late_charge_status,
    lateChargeWaived: Boolean(row.late_charge_waived),
    invoiceId: row.invoice_id,
    invoiceStatus: row.invoice_status,
    needsReview: Boolean(row.needs_review),
    reviewReason: row.review_reason,
    absenceReason: row.absence_reason,
    absenceNote: row.absence_note,
  }));
}

/** A localized staff name, falling back to the other language. */
export function staffName(person: { ar: string | null; en: string | null }, lang: string): string | null {
  return lang.startsWith('ar') ? person.ar || person.en : person.en || person.ar;
}

export type CheckInResult =
  | { status: 'checked_in'; attendance_id: string; attendance_date: string; check_in: string; early_minutes: number }
  | { status: 'already_checked_in'; attendance_id: string; check_in: string; checked_in_by: string | null }
  | { status: 'already_checked_out'; attendance_id: string; check_in: string; check_out: string }
  | { status: 'rejected'; reason: string };

export type CheckOutResult =
  | {
      status: 'checked_out';
      attendance_id: string;
      check_out: string;
      pickup_person_name: string | null;
      late_pickup: boolean;
      late_minutes: number;
      extra_hours: number;
      extra_hours_covered: number;
      extra_hours_billed: number;
      extra_fee: number;
      fee_rate: number;
      invoice_id: string | null;
    }
  | { status: 'rejected'; reason: string; attendance_id?: string; check_in?: string; min_minutes?: number };

/** What the scanner verified about the person collecting the child; merged into qr_scan_log. */
export type PickupDetails = {
  pickup_person_name?: string | null;
  pickup_relationship?: string | null;
  pickup_photo_url?: string | null;
  pickup_identity_type?: string | null;
  pickup_identity_number?: string | null;
  pickup_identity_image_path?: string | null;
  pickup_identity_back_image_path?: string | null;
  pickup_notes?: string | null;
  require_id_capture?: boolean;
  identity_verified?: { verified_at: string; id_photo_path: string | null; method: string } | null;
};

export async function recordCheckIn(args: {
  childId: string;
  method: AttendanceMethod;
  qrTokenId?: string | null;
}): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('record_attendance_check_in' as never, {
    p_child_id: args.childId,
    p_method: args.method,
    p_qr_token_id: args.qrTokenId ?? null,
  } as never);
  if (error) throw error;
  return data as CheckInResult;
}

export async function recordCheckOut(args: {
  attendanceId: string;
  method: AttendanceMethod;
  qrTokenId?: string | null;
  pickup?: PickupDetails;
  force?: boolean;
}): Promise<CheckOutResult> {
  const { data, error } = await supabase.rpc('record_attendance_check_out' as never, {
    p_attendance_id: args.attendanceId,
    p_method: args.method,
    p_qr_token_id: args.qrTokenId ?? null,
    p_pickup: args.pickup ?? {},
    p_force: args.force ?? false,
  } as never);
  if (error) throw error;
  const result = data as CheckOutResult;
  if (result.status === 'checked_out') {
    return {
      ...result,
      late_minutes: num(result.late_minutes),
      extra_hours: num(result.extra_hours),
      extra_hours_covered: num(result.extra_hours_covered),
      extra_hours_billed: num(result.extra_hours_billed),
      extra_fee: num(result.extra_fee),
      fee_rate: num(result.fee_rate),
    };
  }
  return result;
}

export async function undoCheckIn(attendanceId: string) {
  const { error } = await supabase.rpc('undo_attendance_check_in' as never, { p_attendance_id: attendanceId } as never);
  if (error) throw error;
}

export async function correctAttendance(args: {
  attendanceId: string;
  checkIn: string;
  checkOut: string | null;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_correct_attendance' as never, {
    p_attendance_id: args.attendanceId,
    p_check_in: args.checkIn,
    p_check_out: args.checkOut,
    p_reason: args.reason,
  } as never);
  if (error) throw error;
  return data as { extra_hours: number; extra_fee: number; needs_review: boolean; charge: { manual_refund?: boolean } };
}

export async function waiveLateCharge(attendanceId: string, reason: string) {
  const { data, error } = await supabase.rpc('admin_waive_late_charge' as never, {
    p_attendance_id: attendanceId,
    p_reason: reason,
  } as never);
  if (error) throw error;
  return data as { refund: number; manual_refund: boolean };
}

export async function resolveAttendanceReview(attendanceId: string, note?: string) {
  const { error } = await supabase.rpc('admin_resolve_attendance_review' as never, {
    p_attendance_id: attendanceId,
    p_note: note ?? null,
  } as never);
  if (error) throw error;
}

const KNOWN_CODES = new Set([
  'attendance_not_authenticated',
  'attendance_forbidden',
  'attendance_no_permission',
  'attendance_admin_only',
  'attendance_child_not_found',
  'attendance_child_not_active',
  'attendance_invalid_method',
  'attendance_qr_required',
  'attendance_custom_qr_pickup_only',
  'attendance_qr_invalid',
  'attendance_qr_wrong_child',
  'attendance_qr_expired',
  'attendance_qr_wrong_type',
  'attendance_qr_used',
  'attendance_already_checked_out',
  'attendance_not_checked_in',
  'attendance_too_soon',
  'attendance_not_found',
  'attendance_undo_not_allowed',
  'attendance_undo_window_passed',
  'attendance_reason_required',
  'attendance_invalid_times',
  'attendance_invalid_range',
]);

/** i18n key for a server rejection reason or a thrown RPC error (attendance.errors.*). */
export function attendanceErrorKey(errorOrReason: unknown): string {
  const raw =
    typeof errorOrReason === 'string'
      ? errorOrReason
      : errorOrReason && typeof errorOrReason === 'object' && 'message' in errorOrReason
        ? String((errorOrReason as { message: unknown }).message)
        : '';
  const code = [...KNOWN_CODES].find((known) => raw.includes(known));
  return code ? `attendance.errors.${code}` : 'attendance.errors.generic';
}
