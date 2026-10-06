import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAttendanceDays } from '@/hooks/useAttendanceDays';
import { minutesFromMidnight } from '@/lib/attendanceAnalytics';
import type { AttendanceDay } from '@/lib/attendanceApi';
import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
import type { PickupSnapshot } from '@/lib/pickupSnapshot';
import { supabase } from '@/lib/supabase';

/** A day in a child's attendance history; upcoming and pre-enrollment days are left out. */
export type DayAttendanceStatus = 'present' | 'partial' | 'absent' | 'excused' | 'off' | 'holiday';

export type DayAttendanceRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: DayAttendanceStatus;
  latePickup: boolean;
  pickup: PickupSnapshot | null;
  /** Full server record for the day (who scanned, method, extra hours, invoice, absence reason). */
  detail: AttendanceDay | null;
};

const DAYS = 30;

/** The last `days` calendar days in the nursery's timezone, newest last. */
export function attendanceWindow(days = DAYS) {
  const to = getNurseryCalendarDateString();
  return { from: addCalendarDaysYmd(to, -(days - 1)), to };
}

function pickupFromDay(day: AttendanceDay): PickupSnapshot | null {
  if (!day.checkOut) return null;
  return {
    personName: day.pickupPersonName,
    photoUrl: day.pickupPhotoUrl,
    purpose: day.checkOutMethod === 'qr_custom' ? 'delegate' : day.checkOutMethod === 'qr_parent' ? 'parent' : null,
    isLatePickup: day.extraHours > 0,
    extraHours: day.extraHours,
    extraFee: day.extraFee,
  };
}

/** Maps a server day to a history row, or null for days that are not shown (future / before enrollment). */
export function toDayRow(day: AttendanceDay): DayAttendanceRow | null {
  if (day.status === 'upcoming' || day.status === 'not_enrolled') return null;
  return {
    date: day.date,
    checkIn: day.checkIn,
    checkOut: day.checkOut,
    status: day.status,
    latePickup: day.extraHours > 0,
    pickup: pickupFromDay(day),
    detail: day,
  };
}

export type AttendanceSummary = {
  ratePct: number;
  avgCheckInMinutes: number | null;
  presentDays: number;
  absentDays: number;
  excusedDays: number;
  /** Days the child was expected and not excused (present + absent): the rate's denominator. */
  schoolDaysCount: number;
  lateDays: number;
  extraHours: number;
  extraHoursCovered: number;
  extraFee: number;
};

export function summarizeDays(rows: Array<Pick<DayAttendanceRow, 'status' | 'checkIn' | 'detail'>>): AttendanceSummary {
  const presentDays = rows.filter((r) => r.status === 'present' || r.status === 'partial').length;
  const absentDays = rows.filter((r) => r.status === 'absent').length;
  const excusedDays = rows.filter((r) => r.status === 'excused').length;
  const schoolDaysCount = presentDays + absentDays;
  const mins = rows.filter((r) => r.checkIn).map((r) => minutesFromMidnight(r.checkIn!));
  return {
    ratePct: schoolDaysCount > 0 ? Math.min(100, Math.round((presentDays / schoolDaysCount) * 1000) / 10) : 0,
    avgCheckInMinutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    presentDays,
    absentDays,
    excusedDays,
    schoolDaysCount,
    lateDays: rows.filter((r) => (r.detail?.extraHours ?? 0) > 0).length,
    extraHours: rows.reduce((sum, r) => sum + (r.detail?.extraHours ?? 0), 0),
    extraHoursCovered: rows.reduce((sum, r) => sum + (r.detail?.extraHoursCovered ?? 0), 0),
    extraFee: rows.reduce((sum, r) => sum + (r.detail?.extraFee ?? 0), 0),
  };
}

export function useChildAttendanceHistory(params: { childId?: string; nurseryId?: string; days?: number }) {
  const window = useMemo(() => attendanceWindow(params.days ?? DAYS), [params.days]);

  const childQuery = useQuery({
    queryKey: ['child-attendance-child', params.childId, params.nurseryId],
    queryFn: async () => {
      if (!params.childId || !params.nurseryId) return null;
      const { data, error } = await supabase
        .from('children')
        .select('id, nursery_id, avatar_url, full_name_ar, full_name_en, class_id, enrollment_date, created_at')
        .eq('id', params.childId)
        .eq('nursery_id', params.nurseryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(params.childId && params.nurseryId),
  });

  const daysQuery = useAttendanceDays({
    childIds: params.childId ? [params.childId] : [],
    from: window.from,
    to: window.to,
    enabled: Boolean(childQuery.data),
  });

  const rows = useMemo(
    () => (daysQuery.data ?? []).map(toDayRow).filter((row): row is DayAttendanceRow => row !== null),
    [daysQuery.data],
  );
  const summary = useMemo(() => summarizeDays(rows), [rows]);

  return {
    ...daysQuery,
    isPending: childQuery.isPending || (Boolean(childQuery.data) && daysQuery.isPending),
    child: childQuery.data ?? null,
    rows,
    summary,
  };
}
