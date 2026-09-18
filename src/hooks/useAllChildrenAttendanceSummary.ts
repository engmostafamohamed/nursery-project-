import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { isLatePickupLog, minutesFromMidnight, toLocalDateString } from '@/lib/attendanceAnalytics';
import { extractPickupSnapshot } from '@/lib/pickupSnapshot';
import { supabase } from '@/lib/supabase';
import type { DayAttendanceRow } from './useChildAttendanceHistory';

export type AllChildAttendanceRow = DayAttendanceRow & {
  childId: string;
};

const DAYS = 30;
const MINI_CALENDAR_DAYS = 14;

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

type ChildStartRow = {
  id: string;
  enrollment_date: string | null;
  created_at: string | null;
};

/** First day a child counts for attendance: enrollment date, else the day the record was created. */
export function attendanceStartDate(row: { enrollment_date?: string | null; created_at?: string | null }): string | null {
  if (row.enrollment_date) return row.enrollment_date.slice(0, 10);
  if (row.created_at) return toLocalDateString(new Date(row.created_at));
  return null;
}

export function useAllChildrenAttendanceSummary(params: {
  childIds: string[];
  nurseryId?: string;
}) {
  const dates = useMemo(() => pastNDates(DAYS), []);
  const sortedIds = useMemo(() => [...params.childIds].sort().join(','), [params.childIds]);

  const query = useQuery({
    queryKey: ['all-children-attendance', sortedIds, params.nurseryId, dates[0]],
    queryFn: async () => {
      if (!params.childIds.length || !params.nurseryId) return { records: [] as RawRecord[], starts: {} as Record<string, string> };
      const from = dates[dates.length - 1];
      const to = dates[0];
      const [attendanceRes, childrenRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('child_id, attendance_date, check_in, check_out, qr_scan_log')
          .in('child_id', params.childIds)
          .gte('attendance_date', from)
          .lte('attendance_date', to),
        supabase
          .from('children')
          .select('id, enrollment_date, created_at')
          .in('id', params.childIds),
      ]);
      if (attendanceRes.error) throw attendanceRes.error;
      if (childrenRes.error) throw childrenRes.error;
      const starts: Record<string, string> = {};
      for (const child of (childrenRes.data ?? []) as ChildStartRow[]) {
        const start = attendanceStartDate(child);
        if (start) starts[child.id] = start;
      }
      return { records: (attendanceRes.data ?? []) as RawRecord[], starts };
    },
    enabled: Boolean(params.childIds.length && params.nurseryId),
  });
  const records = useMemo(() => query.data?.records ?? [], [query.data?.records]);
  const starts = useMemo(() => query.data?.starts ?? {}, [query.data?.starts]);
  // Days before a child joined the nursery are not attendance days for that child.
  const isEnrolledOn = useCallback(
    (childId: string, date: string) => {
      const start = starts[childId];
      return !start || date >= start;
    },
    [starts],
  );

  const rows: DayAttendanceRow[] = useMemo(() => {
    const byDate = new Map<string, RawRecord[]>();
    for (const r of records) {
      const list = byDate.get(r.attendance_date) ?? [];
      list.push(r);
      byDate.set(r.attendance_date, list);
    }

    return dates.filter((date) => params.childIds.some((childId) => isEnrolledOn(childId, date))).map((date) => {
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
  }, [dates, records, isEnrolledOn, params.childIds]);

  const childRows: AllChildAttendanceRow[] = useMemo(() => {
    const byChildDate = new Map<string, RawRecord>();
    for (const r of records) {
      byChildDate.set(`${r.child_id}|${r.attendance_date}`, r);
    }

    return dates.flatMap((date) =>
      params.childIds.filter((childId) => isEnrolledOn(childId, date)).map((childId) => {
        const r = byChildDate.get(`${childId}|${date}`);
        if (!r) {
          return { childId, date, checkIn: null, checkOut: null, status: 'absent' as const, latePickup: false, pickup: null };
        }
        const checkIn = r.check_in;
        const checkOut = r.check_out;
        const pickup = checkOut ? extractPickupSnapshot(r.qr_scan_log) : null;
        let status: DayAttendanceRow['status'] = 'absent';
        if (checkIn && checkOut) status = 'present';
        else if (checkIn) status = 'partial';
        return { childId, date, checkIn, checkOut, status, latePickup: pickup?.isLatePickup ?? false, pickup };
      }),
    );
  }, [dates, params.childIds, records, isEnrolledOn]);

  const summary = useMemo(() => {
    const schoolDateSet = new Set<string>();
    for (const date of dates) {
      const w = new Date(date + 'T12:00:00').getDay();
      if (w !== 0 && w !== 6) schoolDateSet.add(date);
    }

    // Each child only counts the school days since they joined.
    const totalChildSchoolDays = params.childIds.reduce(
      (sum, childId) => sum + [...schoolDateSet].filter((date) => isEnrolledOn(childId, date)).length,
      0,
    );
    const presentChildDays = records.filter(
      (r) => r.check_in && schoolDateSet.has(r.attendance_date) && isEnrolledOn(r.child_id, r.attendance_date),
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
  }, [records, isEnrolledOn, dates, params.childIds]);

  const perChildSummary = useMemo(() => {
    const schoolDateSet = new Set<string>();
    for (const date of dates) {
      const w = new Date(date + 'T12:00:00').getDay();
      if (w !== 0 && w !== 6) schoolDateSet.add(date);
    }

    const presentByChildDate = new Set(
      records
        .filter((row) => row.check_in)
        .map((row) => `${row.child_id}|${row.attendance_date}`),
    );

    return params.childIds.reduce<Record<string, {
      presentDays: number;
      absentDays: number;
      schoolDaysCount: number;
      ratePct: number;
      calendar: Array<{ date: string; status: 'present' | 'absent' | 'off' }>;
    }>>((acc, childId) => {
      const schoolDays = dates.filter((date) => schoolDateSet.has(date) && isEnrolledOn(childId, date));
      const presentDays = schoolDays.filter((date) => presentByChildDate.has(`${childId}|${date}`)).length;
      const calendar = dates.slice(0, MINI_CALENDAR_DAYS).reverse().map((date) => {
        if (!schoolDateSet.has(date) || !isEnrolledOn(childId, date)) return { date, status: 'off' as const };
        return {
          date,
          status: presentByChildDate.has(`${childId}|${date}`) ? ('present' as const) : ('absent' as const),
        };
      });

      acc[childId] = {
        presentDays,
        absentDays: Math.max(0, schoolDays.length - presentDays),
        schoolDaysCount: schoolDays.length,
        ratePct: schoolDays.length > 0 ? Math.min(100, Math.round((presentDays / schoolDays.length) * 1000) / 10) : 0,
        calendar,
      };
      return acc;
    }, {});
  }, [records, isEnrolledOn, dates, params.childIds]);

  return {
    ...query,
    rows,
    childRows,
    summary,
    perChildSummary,
  };
}
