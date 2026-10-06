import {
  recordCheckIn,
  recordCheckOut,
  type AttendanceMethod,
  type PickupDetails,
} from '@/lib/attendanceApi';
import { supabase } from '@/lib/supabase';

export type TeacherAttendanceToggleChild = {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
};

export type TeacherAttendanceRow = {
  id: string;
  child_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
};

export type PickupContext = {
  purpose?: 'parent' | 'delegate';
  delegateName?: string | null;
  pickupPersonFullName?: string | null;
  pickupRelationship?: string | null;
  pickupIdentityType?: string | null;
  pickupIdentityNumber?: string | null;
  pickupIdentityImagePath?: string | null;
  pickupIdentityBackImagePath?: string | null;
  pickupNotes?: string | null;
  requireIdCapture?: boolean;
  /** uuid of the user who minted the QR (parent) — used to look up their photo. */
  issuedBy?: string | null;
  /** Identity already resolved by caller (skips re-query inside the toggle). */
  preResolved?: ResolvedPickupIdentity;
  /** Storage path of the live ID photo captured by the guard at pickup. */
  idPhotoPath?: string | null;
  /** True once a staff member confirmed the person matches (the server records who). */
  identityConfirmed?: boolean;
};

export type ResolvedPickupIdentity = {
  pickupPersonName: string | null;
  pickupPhotoUrl: string | null;
};

export type TeacherAttendanceToggleResult =
  | {
      mode: 'checkout';
      attendanceId: string;
      latePickup: boolean;
      lateMinutes: number;
      extraHours: number;
      extraHoursCovered: number;
      extraFee: number;
      pickupPersonName: string | null;
      pickupPhotoUrl: string | null;
    }
  | { mode: 'checkin'; attendanceId: string; checkIn: string }
  | { mode: 'already_checked_in'; attendanceId: string; checkIn: string; checkedInBy: string | null }
  | { mode: 'already_checked_out'; attendanceId: string; checkOut: string }
  | { mode: 'rejected'; reason: string; minMinutes?: number };

type AttendanceWindow = {
  endTime: string | null;
  graceMinutes: number;
  feePerHour: number;
};

/**
 * Display-only estimate of billable hours past closing (whole hours, after grace) for a child
 * still in the nursery. The real charge is computed by the server at checkout / by the sweep.
 */
export function computeLatePickup(checkOut: Date, attendanceDate: string, window: AttendanceWindow) {
  if (!window.endTime) return { latePickup: false, extraHours: 0, extraFee: 0, lateMinutes: 0 };
  const [hh, mm] = window.endTime.split(':').map((s) => Number(s));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { latePickup: false, extraHours: 0, extraFee: 0, lateMinutes: 0 };
  }
  const [yy, mo, dd] = attendanceDate.split('-').map((s) => Number(s));
  const endOfDay = new Date(yy, (mo ?? 1) - 1, dd ?? 1, hh, mm, 0, 0);
  const lateMs = checkOut.getTime() - endOfDay.getTime();
  const lateMinutes = Math.max(0, Math.floor(lateMs / 60000));
  if (lateMinutes <= window.graceMinutes) {
    return { latePickup: false, extraHours: 0, extraFee: 0, lateMinutes };
  }
  const extraHours = Math.ceil(lateMinutes / 60);
  const extraFee = Number((extraHours * window.feePerHour).toFixed(2));
  return { latePickup: true, extraHours, extraFee, lateMinutes };
}

function pickupDetails(pickup: PickupContext, resolved: ResolvedPickupIdentity): PickupDetails {
  const details: PickupDetails = {
    pickup_person_name: resolved.pickupPersonName,
    pickup_photo_url: resolved.pickupPhotoUrl,
    pickup_relationship: pickup.pickupRelationship ?? null,
    pickup_identity_type: pickup.pickupIdentityType ?? null,
    pickup_identity_number: pickup.pickupIdentityNumber ?? null,
    pickup_identity_image_path: pickup.pickupIdentityImagePath ?? null,
    pickup_identity_back_image_path: pickup.pickupIdentityBackImagePath ?? null,
    pickup_notes: pickup.pickupNotes ?? null,
    require_id_capture: pickup.requireIdCapture ?? true,
  };
  if (pickup.identityConfirmed || pickup.idPhotoPath) {
    details.identity_verified = {
      verified_at: new Date().toISOString(),
      id_photo_path: pickup.idPhotoPath ?? null,
      method: pickup.idPhotoPath ? 'photo+id_capture' : 'photo_only',
    };
  }
  return details;
}

/**
 * Check a child in, or out when they are already in, through the attendance server functions.
 * The server records the staff member and method, bills extra hours, writes the audit log and
 * notifies the parents, so nothing here writes to attendance_records or notifications directly.
 */
export async function teacherAttendanceToggle(
  child: TeacherAttendanceToggleChild,
  existing: TeacherAttendanceRow | null | undefined,
  _today: string,
  pickup: PickupContext = {},
  options: { method?: AttendanceMethod; qrTokenId?: string | null; force?: boolean } = {},
): Promise<TeacherAttendanceToggleResult> {
  const method = options.method ?? 'manual';

  if (existing?.check_in && !existing.check_out) {
    const resolved = pickup.preResolved ?? (await resolvePickupIdentity(child.id, pickup));
    const result = await recordCheckOut({
      attendanceId: existing.id,
      method,
      qrTokenId: options.qrTokenId,
      pickup: pickupDetails(pickup, resolved),
      force: options.force,
    });
    if (result.status === 'rejected') {
      return { mode: 'rejected', reason: result.reason, minMinutes: result.min_minutes };
    }
    return {
      mode: 'checkout',
      attendanceId: result.attendance_id,
      latePickup: result.late_pickup,
      lateMinutes: result.late_minutes,
      extraHours: result.extra_hours,
      extraHoursCovered: result.extra_hours_covered,
      extraFee: result.extra_fee,
      pickupPersonName: result.pickup_person_name ?? resolved.pickupPersonName,
      pickupPhotoUrl: resolved.pickupPhotoUrl,
    };
  }

  const result = await recordCheckIn({ childId: child.id, method, qrTokenId: options.qrTokenId });
  if (result.status === 'rejected') return { mode: 'rejected', reason: result.reason };
  if (result.status === 'already_checked_in') {
    return { mode: 'already_checked_in', attendanceId: result.attendance_id, checkIn: result.check_in, checkedInBy: result.checked_in_by };
  }
  if (result.status === 'already_checked_out') {
    return { mode: 'already_checked_out', attendanceId: result.attendance_id, checkOut: result.check_out };
  }
  return { mode: 'checkin', attendanceId: result.attendance_id, checkIn: result.check_in };
}

/**
 * Pick out who picked up the child and which photo to attach.
 * - delegate QR: prefer an authorized_pickup row matching the delegate name (case-insensitive)
 *   for this child; fall back to the typed delegate name with no photo.
 * - parent QR: use the parent who minted the QR (issuedBy) and their id_photo_url.
 */
export async function resolvePickupIdentity(
  childId: string,
  pickup: PickupContext,
): Promise<ResolvedPickupIdentity> {
  const purpose = pickup.purpose ?? 'parent';
  if (purpose === 'delegate' && pickup.pickupPersonFullName) {
    return {
      pickupPersonName: pickup.pickupPersonFullName.trim(),
      pickupPhotoUrl: null,
    };
  }
  if (purpose === 'delegate' && pickup.delegateName) {
    const name = pickup.delegateName.trim();
    const ap = await supabase
      .from('authorized_pickups')
      .select('name, photo_url')
      .eq('child_id', childId)
      .ilike('name', name);
    const match = ((ap.data ?? []) as { name: string | null; photo_url: string | null }[])[0];
    return {
      pickupPersonName: match?.name ?? name,
      pickupPhotoUrl: match?.photo_url ?? null,
    };
  }
  if (purpose === 'parent' && pickup.issuedBy) {
    const u = await supabase
      .from('users')
      .select('name_ar, name_en, id_photo_url')
      .eq('id', pickup.issuedBy)
      .maybeSingle();
    const row = (u.data ?? null) as { name_ar: string | null; name_en: string | null; id_photo_url: string | null } | null;
    if (row) {
      const name = (row.name_en ?? '').trim() || (row.name_ar ?? '').trim() || null;
      return { pickupPersonName: name, pickupPhotoUrl: row.id_photo_url ?? null };
    }
  }
  return { pickupPersonName: null, pickupPhotoUrl: null };
}
