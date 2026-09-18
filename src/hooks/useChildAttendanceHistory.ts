import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { minutesFromMidnight, toLocalDateString } from '@/lib/attendanceAnalytics';
import { extractPickupSnapshot, type PickupSnapshot } from '@/lib/pickupSnapshot';
import { supabase } from '@/lib/supabase';

export type DayAttendanceRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'partial' | 'absent';
  latePickup: boolean;
  pickup: PickupSnapshot | null;
};

const DAYS = 30;

function pastNDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i += 1) {
    const x = new Date(d);
    x.setDate(x.getDate() - i);
    out.push(toLocalDateString(x));
  }
  return out;
}

export function useChildAttendanceHistory(params: { childId?: string; nurseryId?: string }) {
  const dates = useMemo(() => pastNDates(DAYS), []);

  const query = useQuery({
    queryKey: ['child-attendance-history', params.childId, params.nurseryId, dates[0], dates[dates.length - 1]],
    queryFn: async () => {
      if (!params.childId || !params.nurseryId) return { child: null, records: [] as Record<string, unknown>[] };

      const { data: child, error: cErr } = await supabase
        .from('children')
        .select('id, nursery_id, avatar_url, full_name_ar, full_name_en, class_id, enrollment_date, created_at')
        .eq('id', params.childId)
        .eq('nursery_id', params.nurseryId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!child) return { child: null, records: [] };

      const from = dates[dates.length - 1];
      const to = dates[0];
      const { data: att, error: aErr } = await supabase
        .from('attendance_records')
        .select('attendance_date, check_in, check_out, qr_scan_log')
        .eq('child_id', params.childId)
        .gte('attendance_date', from)
        .lte('attendance_date', to);
      if (aErr) throw aErr;

      return { child, records: att ?? [] };
    },
    enabled: Boolean(params.childId && params.nurseryId),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    (query.data?.records ?? []).forEach((r) => {
      map.set(String(r.attendance_date), r);
    });
    return map;
  }, [query.data?.records]);

  // Days before the child joined the nursery are not attendance days.
  const startDate = useMemo(() => {
    const child = query.data?.child as { enrollment_date?: string | null; created_at?: string | null } | null | undefined;
    if (!child) return null;
    if (child.enrollment_date) return child.enrollment_date.slice(0, 10);
    if (child.created_at) return toLocalDateString(new Date(child.created_at));
    return null;
  }, [query.data?.child]);

  const rows: DayAttendanceRow[] = useMemo(() => {
    return dates.filter((date) => !startDate || date >= startDate).map((date) => {
      const r = byDate.get(date);
      if (!r) {
        return { date, checkIn: null, checkOut: null, status: 'absent', latePickup: false, pickup: null };
      }
      const checkIn = (r.check_in as string | null) ?? null;
      const checkOut = (r.check_out as string | null) ?? null;
      const pickup = checkOut ? extractPickupSnapshot(r.qr_scan_log) : null;
      let status: DayAttendanceRow['status'] = 'absent';
      if (checkIn && checkOut) status = 'present';
      else if (checkIn) status = 'partial';
      return { date, checkIn, checkOut, status, latePickup: pickup?.isLatePickup ?? false, pickup };
    });
  }, [dates, byDate, startDate]);

  const summary = useMemo(() => {
    const withIn = rows.filter((r) => r.checkIn);
    const schoolDays = rows.filter((d) => {
      const w = new Date(d.date + 'T12:00:00').getDay();
      return w !== 0 && w !== 6;
    });
    const presentDays = schoolDays.filter((r) => r.checkIn).length;
    const ratePct =
      schoolDays.length > 0 ? Math.min(100, Math.round((presentDays / schoolDays.length) * 1000) / 10) : 0;
    const mins = withIn.map((r) => minutesFromMidnight(r.checkIn!));
    const avgMin = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null;
    return { ratePct, avgCheckInMinutes: avgMin, presentDays, schoolDaysCount: schoolDays.length };
  }, [rows]);

  return {
    ...query,
    child: query.data?.child ?? null,
    rows,
    summary,
  };
}
