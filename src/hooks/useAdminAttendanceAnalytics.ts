import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  calendarMonthRangeToToday,
  countWeekdays,
  eachDateInRange,
  isLatePickupLog,
  rollingWeekRangeToToday,
} from '@/lib/attendanceAnalytics';
import { supabase } from '@/lib/supabase';

export type AttendanceDatePreset = 'week' | 'month' | 'custom';

export type AttendanceRecordRow = {
  id: string;
  child_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  qr_scan_log: unknown;
};

export function useAdminAttendanceAnalytics(params: {
  nurseryId?: string;
  preset: AttendanceDatePreset;
  customFrom?: string;
  customTo?: string;
}) {
  const { from, to } = useMemo(() => {
    if (params.preset === 'custom' && params.customFrom && params.customTo) {
      return { from: params.customFrom, to: params.customTo };
    }
    if (params.preset === 'month') return calendarMonthRangeToToday();
    return rollingWeekRangeToToday();
  }, [params.preset, params.customFrom, params.customTo]);

  const customReady = params.preset !== 'custom' || (Boolean(params.customFrom) && Boolean(params.customTo));

  const query = useQuery({
    queryKey: ['admin-attendance-analytics', params.nurseryId, from, to],
    queryFn: async () => {
      if (!params.nurseryId) {
        return {
          records: [] as AttendanceRecordRow[],
          activeChildIds: [] as string[],
          childClassMap: new Map<string, string | null>(),
          classNames: new Map<string, string>(),
        };
      }

      const { data: children, error: cErr } = await supabase
        .from('children')
        .select('id, class_id')
        .eq('nursery_id', params.nurseryId)
        .eq('status', 'active');
      if (cErr) throw cErr;
      const childRows = (children ?? []) as { id: string; class_id: string | null }[];
      const activeChildIds = childRows.map((c) => c.id);
      const childClassMap = new Map(childRows.map((c) => [c.id, c.class_id]));

      const classIds = [...new Set(childRows.map((c) => c.class_id).filter(Boolean))] as string[];
      const classNames = new Map<string, string>();
      if (classIds.length) {
        const { data: classes, error: clErr } = await supabase
          .from('classes')
          .select('id, name_ar, name_en')
          .in('id', classIds)
          .eq('nursery_id', params.nurseryId);
        if (clErr) throw clErr;
        ((classes ?? []) as { id: string; name_ar: string; name_en: string }[]).forEach((cl) => {
          classNames.set(cl.id, cl.name_ar || cl.name_en || cl.id);
        });
      }

      if (!activeChildIds.length) {
        return { records: [] as AttendanceRecordRow[], activeChildIds, childClassMap, classNames };
      }

      const { data: att, error: aErr } = await supabase
        .from('attendance_records')
        .select('id, child_id, attendance_date, check_in, check_out, qr_scan_log')
        .gte('attendance_date', from)
        .lte('attendance_date', to)
        .in('child_id', activeChildIds);
      if (aErr) throw aErr;
      const records = (att ?? []) as AttendanceRecordRow[];

      return { records, activeChildIds, childClassMap, classNames };
    },
    enabled: Boolean(params.nurseryId && customReady),
  });

  const stats = useMemo(() => {
    const activeCount = query.data?.activeChildIds.length ?? 0;
    const records = query.data?.records ?? [];
    const childClassMap = query.data?.childClassMap ?? new Map<string, string | null>();
    const classNames = query.data?.classNames ?? new Map<string, string>();
    const weekdays = Math.max(0, countWeekdays(from, to));
    const possibleChildDays = activeCount * weekdays;

    const presentRows = records.filter((r) => r.check_in);
    const totalPresent = presentRows.length;
    const avgRatePct = possibleChildDays > 0 ? Math.min(100, Math.round((totalPresent / possibleChildDays) * 1000) / 10) : 0;
    const totalAbsences = Math.max(0, possibleChildDays - totalPresent);
    const latePickups = records.filter((r) => isLatePickupLog(r.qr_scan_log)).length;

    const dates = eachDateInRange(from, to);
    const dailyPresent: { date: string; count: number; late: number }[] = dates.map((date) => {
      const dayRec = records.filter((r) => r.attendance_date === date);
      return {
        date,
        count: dayRec.filter((r) => r.check_in).length,
        late: dayRec.filter((r) => isLatePickupLog(r.qr_scan_log)).length,
      };
    });

    const maxDaily = Math.max(1, ...dailyPresent.map((d) => d.count));

    const activeChildIds = query.data?.activeChildIds ?? [];
    const byClass = new Map<string, string[]>();
    for (const cid of activeChildIds) {
      const raw = childClassMap.get(cid);
      const key = raw ?? '__unassigned__';
      const list = byClass.get(key) ?? [];
      list.push(cid);
      byClass.set(key, list);
    }

    const classStats = [...byClass.entries()].map(([classId, ids]) => {
      const size = ids.length;
      const presentInClass = records.filter((r) => r.check_in && ids.includes(r.child_id)).length;
      const possible = size * weekdays;
      const rate = possible > 0 ? Math.min(100, Math.round((presentInClass / possible) * 1000) / 10) : 0;
      return {
        classId,
        name: classId === '__unassigned__' ? '__unassigned__' : classNames.get(classId) ?? classId,
        present: presentInClass,
        rate,
        size,
      };
    });

    return {
      avgRatePct,
      totalAbsences,
      latePickups,
      dailyPresent,
      maxDaily,
      classStats,
      activeCount,
      weekdays,
      from,
      to,
    };
  }, [query.data, from, to]);

  return {
    ...query,
    range: { from, to },
    stats,
  };
}
