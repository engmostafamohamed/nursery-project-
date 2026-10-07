import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchAttendanceDays, type AttendanceDay } from '@/lib/attendanceApi';
import { calendarMonthRangeToToday, eachDateInRange, rollingWeekRangeToToday } from '@/lib/attendanceAnalytics';
import { supabase } from '@/lib/supabase';

export type AttendanceDatePreset = 'week' | 'month' | 'custom';

/** The server reads at most 400 days at a time; a year is plenty for a report. */
export const MAX_ANALYTICS_RANGE_DAYS = 366;

const isPresent = (day: AttendanceDay) => day.status === 'present' || day.status === 'partial';
/** A school day the child was enrolled for: present, absent, or absent with a reason from the parent. */
const isExpected = (day: AttendanceDay) => isPresent(day) || day.status === 'absent' || day.status === 'excused';
const rate = (present: number, expected: number) => (expected > 0 ? Math.min(100, Math.round((present / expected) * 1000) / 10) : 0);

/**
 * Attendance for a date range, counted from get_attendance_days: the server decides which days are
 * school days (the nursery's own working days and holidays) and when each child was enrolled, so
 * these numbers match the attendance panel and the logs.
 */
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
  const rangeError: 'fromAfterTo' | 'rangeTooLong' | null =
    from > to
      ? 'fromAfterTo'
      : Date.parse(to) - Date.parse(from) > MAX_ANALYTICS_RANGE_DAYS * 86_400_000
        ? 'rangeTooLong'
        : null;

  const query = useQuery({
    queryKey: ['admin-attendance-analytics', params.nurseryId, from, to],
    queryFn: async () => {
      if (!params.nurseryId) {
        return { days: [] as AttendanceDay[], activeChildIds: [] as string[], childClassMap: new Map<string, string | null>(), classNames: new Map<string, string>() };
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

      const days = await fetchAttendanceDays(activeChildIds, from, to);
      return { days, activeChildIds, childClassMap, classNames };
    },
    enabled: Boolean(params.nurseryId && customReady && !rangeError),
  });

  const stats = useMemo(() => {
    const days = query.data?.days ?? [];
    const activeChildIds = query.data?.activeChildIds ?? [];
    const childClassMap = query.data?.childClassMap ?? new Map<string, string | null>();
    const classNames = query.data?.classNames ?? new Map<string, string>();

    const expectedDays = days.filter(isExpected);
    const presentDays = expectedDays.filter(isPresent);
    const lateDays = days.filter((d) => d.extraHours > 0);

    const dailyPresent = eachDateInRange(from, to).map((date) => {
      const ofDay = days.filter((d) => d.date === date);
      const expected = ofDay.filter(isExpected).length;
      return {
        date,
        count: ofDay.filter(isPresent).length,
        late: ofDay.filter((d) => d.extraHours > 0).length,
        /** Children expected that day; 0 when the nursery was closed. */
        expected,
        absent: ofDay.filter((d) => d.status === 'absent').length,
      };
    });

    const byClass = new Map<string, Set<string>>();
    for (const childId of activeChildIds) {
      const key = childClassMap.get(childId) ?? '__unassigned__';
      byClass.set(key, (byClass.get(key) ?? new Set<string>()).add(childId));
    }
    const classStats = [...byClass.entries()].map(([classId, ids]) => {
      const ofClass = expectedDays.filter((d) => ids.has(d.childId));
      const present = ofClass.filter(isPresent).length;
      return {
        classId,
        name: classId === '__unassigned__' ? '__unassigned__' : classNames.get(classId) ?? classId,
        present,
        rate: rate(present, ofClass.length),
        size: ids.size,
      };
    });

    return {
      avgRatePct: rate(presentDays.length, expectedDays.length),
      // Unexcused only, as in the attendance panel; absences the parent reported are not counted.
      totalAbsences: expectedDays.filter((d) => d.status === 'absent').length,
      latePickups: lateDays.length,
      dailyPresent,
      maxDaily: Math.max(1, ...dailyPresent.map((d) => d.count)),
      classStats,
      activeCount: activeChildIds.length,
      /** School days in the range (days the nursery was open for at least one child). */
      weekdays: dailyPresent.filter((d) => d.expected > 0).length,
      from,
      to,
    };
  }, [query.data, from, to]);

  return {
    ...query,
    range: { from, to },
    rangeError,
    stats,
  };
}
