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

type ParentChildRow = { parent_id: string };

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
  /** uuid of the teacher who confirmed the identity match. */
  verifiedBy?: string | null;
};

export type ResolvedPickupIdentity = {
  pickupPersonName: string | null;
  pickupPhotoUrl: string | null;
};

export type TeacherAttendanceToggleResult =
  | {
      mode: 'checkout';
      latePickup: boolean;
      extraHours: number;
      extraFee: number;
      pickupPersonName: string | null;
      pickupPhotoUrl: string | null;
    }
  | {
      mode: 'checkin';
      created: TeacherAttendanceRow;
      previous: TeacherAttendanceRow | null;
    };

type AttendanceWindow = {
  endTime: string | null;
  graceMinutes: number;
  feePerHour: number;
};

async function loadAttendanceWindow(nurseryId: string): Promise<AttendanceWindow> {
  const { data } = await supabase
    .from('nursery_settings')
    .select('standard_end_time, late_pickup_grace_minutes, late_pickup_fee_per_hour')
    .eq('nursery_id', nurseryId)
    .maybeSingle();
  const row = (data ?? {}) as {
    standard_end_time?: string | null;
    late_pickup_grace_minutes?: number | null;
    late_pickup_fee_per_hour?: string | number | null;
  };
  const fee = row.late_pickup_fee_per_hour;
  return {
    endTime: row.standard_end_time ?? null,
    graceMinutes: typeof row.late_pickup_grace_minutes === 'number' ? row.late_pickup_grace_minutes : 0,
    feePerHour: typeof fee === 'string' ? Number(fee) : typeof fee === 'number' ? fee : 0,
  };
}

/** Compute billable extra hours past nursery end-time (rounded UP to whole hours, after grace). */
export function computeLatePickup(checkOut: Date, attendanceDate: string, window: AttendanceWindow) {
  if (!window.endTime) return { latePickup: false, extraHours: 0, extraFee: 0, lateMinutes: 0 };
  const [hh, mm] = window.endTime.split(':').map((s) => Number(s));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { latePickup: false, extraHours: 0, extraFee: 0, lateMinutes: 0 };
  }
  const [yy, mo, dd] = attendanceDate.split('-').map((s) => Number(s));
  // Nursery local end-of-day. Use the device timezone (matches the nursery in single-tenant deployments).
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

/**
 * Toggle today's attendance for a child (check-in or check-out). Matches teacher portal behavior.
 * On check-out, computes extra-hour billing using nursery_settings and stamps qr_scan_log.
 */
export async function teacherAttendanceToggle(
  child: TeacherAttendanceToggleChild,
  existing: TeacherAttendanceRow | null | undefined,
  today: string,
  pickup: PickupContext = {},
): Promise<TeacherAttendanceToggleResult> {
  const now = new Date();
  if (existing?.check_in && !existing.check_out) {
    // Atomically sets check_out and finalizes the day's late-pickup billing server-side —
    // replaces the old client-orchestrated "set checkout, then separately call
    // package_apply_extra_hours" sequence. This RPC shares its billing math with the
    // automatic late-pickup sweep (apply_attendance_late_charge), so a child who was already
    // provisionally charged by the sweep gets that charge corrected/finalized here rather
    // than double-billed.
    const { data: billingRaw, error: billingError } = await supabase.rpc(
      'record_attendance_checkout_billing' as never,
      {
        p_attendance_id: existing.id,
        p_checkout_at: now.toISOString(),
      } as never,
    );
    if (billingError) throw billingError;
    const billingResult = (billingRaw ?? {}) as {
      late_pickup?: boolean;
      extra_hours?: number;
      extra_fee?: number;
    };
    const billing = {
      latePickup: billingResult.late_pickup ?? false,
      extraHours: billingResult.extra_hours ?? 0,
      extraFee: billingResult.extra_fee ?? 0,
      lateMinutes: 0,
    };
    const window = await loadAttendanceWindow(child.nursery_id);

    // Resolve who picked up + their photo for the notification.
    const { pickupPersonName, pickupPhotoUrl } =
      pickup.preResolved ?? (await resolvePickupIdentity(child.id, pickup));

    const scanLog: Record<string, unknown> = {
      late_pickup: billing.latePickup,
      extra_hours: billing.extraHours,
      extra_fee: billing.extraFee,
      end_time: window.endTime,
      grace_minutes: window.graceMinutes,
      fee_per_hour: window.feePerHour,
      checked_out_at: now.toISOString(),
      pickup_purpose: pickup.purpose ?? null,
      pickup_person_name: pickupPersonName,
      pickup_photo_url: pickupPhotoUrl,
      pickup_relationship: pickup.pickupRelationship ?? null,
      pickup_identity_type: pickup.pickupIdentityType ?? null,
      pickup_identity_number: pickup.pickupIdentityNumber ?? null,
      pickup_identity_image_path: pickup.pickupIdentityImagePath ?? null,
      pickup_identity_back_image_path: pickup.pickupIdentityBackImagePath ?? null,
      pickup_notes: pickup.pickupNotes ?? null,
      require_id_capture: pickup.requireIdCapture ?? true,
    };
    if (pickup.verifiedBy || pickup.idPhotoPath) {
      scanLog.identity_verified = {
        verified_by: pickup.verifiedBy ?? null,
        verified_at: now.toISOString(),
        id_photo_path: pickup.idPhotoPath ?? null,
        method: pickup.idPhotoPath ? 'photo+id_capture' : 'photo_only',
      };
    }
    // check_out/extra_hours are already set by the RPC above — this only attaches the
    // pickup-identity metadata the RPC doesn't know about.
    const { error } = await supabase
      .from('attendance_records')
      .update({ qr_scan_log: scanLog } as never)
      .eq('id', existing.id);
    if (error) throw error;

    // Notify parents of this child that a pickup just happened.
    await sendPickupNotification({
      child,
      checkOutAt: now,
      pickupPersonName,
      pickupPhotoUrl,
      latePickup: billing.latePickup,
      extraHours: billing.extraHours,
      extraFee: billing.extraFee,
    });

    return {
      mode: 'checkout',
      latePickup: billing.latePickup,
      extraHours: billing.extraHours,
      extraFee: billing.extraFee,
      pickupPersonName,
      pickupPhotoUrl,
    };
  }

  const { data: upserted, error } = await supabase
    .from('attendance_records')
    .upsert(
      {
        child_id: child.id,
        attendance_date: today,
        check_in: now.toISOString(),
        check_out: null,
      } as never,
      { onConflict: 'child_id,attendance_date' },
    )
    .select('id, child_id, attendance_date, check_in, check_out')
    .single();
  if (error) throw error;

  const { data: parentRows, error: parentError } = await supabase
    .from('parent_children')
    .select('parent_id')
    .eq('child_id', child.id);
  const parentData = (parentRows ?? []) as ParentChildRow[];
  if (!parentError && parentData.length) {
    const name = child.full_name_ar || child.full_name_en;
    const notificationRows = parentData.map((row) => ({
      nursery_id: child.nursery_id,
      user_id: row.parent_id,
      type: 'attendance_checkin',
      title_ar: 'تم تسجيل حضور الطفل',
      title_en: 'Child checked in',
      body_ar: `تم تسجيل حضور ${name}`,
      body_en: `${name} checked in`,
      channel: 'push' as const,
      read: false,
    }));
    await supabase.from('notifications').insert(notificationRows as never);
  }

  return {
    mode: 'checkin',
    created: upserted as TeacherAttendanceRow,
    previous: existing ?? null,
  };
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

async function sendPickupNotification(args: {
  child: TeacherAttendanceToggleChild;
  checkOutAt: Date;
  pickupPersonName: string | null;
  pickupPhotoUrl: string | null;
  latePickup: boolean;
  extraHours: number;
  extraFee: number;
}) {
  const { child, checkOutAt, pickupPersonName, pickupPhotoUrl, latePickup, extraHours, extraFee } = args;
  const parentRows = await supabase
    .from('parent_children')
    .select('parent_id')
    .eq('child_id', child.id);
  const parents = ((parentRows.data ?? []) as ParentChildRow[]).map((r) => r.parent_id);
  if (!parents.length) return;
  const childName = child.full_name_ar || child.full_name_en;
  const childNameEn = child.full_name_en || child.full_name_ar;
  const timeArEg = checkOutAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });
  const timeEnGb = checkOutAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  const personAr = pickupPersonName ? ` بواسطة ${pickupPersonName}` : '';
  const personEn = pickupPersonName ? ` by ${pickupPersonName}` : '';
  const lateSuffixAr = latePickup
    ? ` · ساعات إضافية: ${extraHours} (${extraFee.toFixed(2)} جنيه)`
    : '';
  const lateSuffixEn = latePickup
    ? ` · Extra hours: ${extraHours} (${extraFee.toFixed(2)} EGP)`
    : '';
  const rows = parents.map((parentId) => ({
    nursery_id: child.nursery_id,
    user_id: parentId,
    type: 'attendance_checkout',
    urgency: 'normal',
    title_ar: 'تم استلام الطفل',
    title_en: 'Child picked up',
    body_ar: `تم استلام ${childName}${personAr} في ${timeArEg}${lateSuffixAr}`,
    body_en: `${childNameEn} was picked up${personEn} at ${timeEnGb}${lateSuffixEn}`,
    channel: 'in_app' as const,
    read: false,
    image_url: pickupPhotoUrl,
    action_link: '/parent/attendance',
    sent_at: new Date().toISOString(),
  }));
  await supabase.from('notifications').insert(rows as never);
}
