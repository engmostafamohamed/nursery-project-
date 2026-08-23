import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { isLatePickupLog, minutesFromMidnight, toLocalDateString } from '@/lib/attendanceAnalytics';
import { supabase } from '@/lib/supabase';
import type { DayAttendanceRow } from './useChildAttendanceHistory';

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

type RawRecord = {
  child_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  qr_scan_log: unknown;
};

export function useAllChildrenAttendanceSummary(params: {
  childIds: string[];
  nurseryId?: string;
}) {
  const dates = useMemo(() => pastNDates(DAYS), []);
  const sortedIds = useMemo(() => [...params.childIds].sort().join(','), [params.childIds]);
  const childCount = params.childIds.length;

  const query = useQuery({
    queryKey: ['all-children-attendance', sortedIds, params.nurseryId, dates[0]],
    queryFn: async () => {
      if (!params.childIds.length || !params.nurseryId) return [] as RawRecord[];
      const from = dates[dates.length - 1];
      const to = dates[0];
      const { data, error } = await supabase
        .from('attendance_records')
        .select('child_id, attendance_date, check_in, check_out, qr_scan_log')
        .in('child_id', params.childIds)
        .gte('attendance_date', from)
        .lte('attendance_date', to);
      if (error) throw error;
      return (data ?? []) as RawRecord[];
    },
    enabled: Boolean(params.childIds.length && params.nurseryId),
  });

  const rows: DayAttendanceRow[] = useMemo(() => {
    const byDate = new Map<string, RawRecord[]>();
    for (const r of query.data ?? []) {
      const list = byDate.get(r.attendance_date) ?? [];
      list.push(r);
      byDate.set(r.attendance_date, list);
    }

    return dates.map((date) => {
      const recs = byDate.get(date) ?? [];
      if (!recs.length)
        return { date, checkIn: null, checkOut: null, status: 'absent' as const, latePickup: false, pickup: null };
      const anyIn = recs.some((r) => r.check_in);
      const allOut = recs.every((r) => r.check_in && r.check_out);
      const latePickup = recs.some((r) => isLatePickupLog(r.qr_scan_log));
      const firstIn = recs.map((r) => r.check_in).filter(Boolean).sort()[0] ?? null;
      const lastOut = recs.map((r) => r.check_out).filter(Boolean).sort().reverse()[0] ?? null;
      let status: DayAttendanceRow['status'] = 'absent';
      if (anyIn && allOut) status = 'present';
      else if (anyIn) status = 'partial';
      // Aggregated multi-child rows don't surface a single pickup identity.
      return { date, checkIn: firstIn, checkOut: lastOut, status, latePickup, pickup: null };
    });
  }, [dates, query.data]);

  const summary = useMemo(() => {
    const records = query.data ?? [];
    const schoolDateSet = new Set<string>();
    for (const date of dates) {
      const w = new Date(date + 'T12:00:00').getDay();
      if (w !== 0 && w !== 6) schoolDateSet.add(date);
    }

    const totalChildSchoolDays = schoolDateSet.size * childCount;
    const presentChildDays = records.filter(
      (r) => r.check_in && schoolDateSet.has(r.attendance_date),
    ).length;

    const ratePct =
      totalChildSchoolDays > 0
        ? Math.min(100, Math.round((presentChildDays / totalChildSchoolDays) * 1000) / 10)
        : 0;

    const allCheckIns = records
      .filter((r) => r.check_in)
      .map((r) => minutesFromMidnight(r.check_in!));
    const avgMin = allCheckIns.length
      ? allCheckIns.reduce((a, b) => a + b, 0) / allCheckIns.length
      : null;

    return {
      ratePct,
      avgCheckInMinutes: avgMin,
      presentDays: presentChildDays,
      schoolDaysCount: totalChildSchoolDays,
    };
  }, [query.data, dates, childCount]);

  return {
    ...query,
    rows,
    summary,
  };
}
