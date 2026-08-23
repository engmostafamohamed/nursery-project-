/**
 * Typed view over `attendance_records.qr_scan_log`. The column is jsonb; this
 * helper isolates every read of it so consumers don't need to know the shape.
 *
 * The shape mirrors what `teacherAttendanceToggle` writes on checkout (see
 * src/lib/teacherAttendanceToggle.ts).
 */

export type PickupPurpose = 'parent' | 'delegate';

export type PickupSnapshot = {
  /** Display name of whoever picked the child up, when known. */
  personName: string | null;
  /** Avatar/photo of that person, when stored. */
  photoUrl: string | null;
  /** Which QR flow produced the checkout. */
  purpose: PickupPurpose | null;
  /** True if the checkout happened past nursery close + grace. */
  isLatePickup: boolean;
  /** Whole hours billed past close. 0 when on time. */
  extraHours: number;
  /** Estimated fee in EGP. 0 when on time. */
  extraFee: number;
};

const EMPTY: PickupSnapshot = {
  personName: null,
  photoUrl: null,
  purpose: null,
  isLatePickup: false,
  extraHours: 0,
  extraFee: 0,
};

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asPurpose(v: unknown): PickupPurpose | null {
  return v === 'parent' || v === 'delegate' ? v : null;
}

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function extractPickupSnapshot(log: unknown): PickupSnapshot {
  if (!log || typeof log !== 'object') return EMPTY;
  const r = log as Record<string, unknown>;
  return {
    personName: asTrimmedString(r.pickup_person_name),
    photoUrl: asTrimmedString(r.pickup_photo_url),
    purpose: asPurpose(r.pickup_purpose),
    isLatePickup: Boolean(r.late_pickup),
    extraHours: asNumber(r.extra_hours),
    extraFee: asNumber(r.extra_fee),
  };
}
