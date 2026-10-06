import { useMemo } from 'react';

import { useAttendanceDays } from '@/hooks/useAttendanceDays';
import {
  attendanceWindow,
  summarizeDays,
  toDayRow,
  type AttendanceSummary,
  type DayAttendanceRow,
  type DayAttendanceStatus,
} from '@/hooks/useChildAttendanceHistory';
import { toLocalDateString } from '@/lib/attendanceAnalytics';

export type AllChildAttendanceRow = DayAttendanceRow & {
  childId: string;
};

const DAYS = 30;
const MINI_CALENDAR_DAYS = 14;

/** First day a child counts for attendance: enrollment date, else the day the record was created. */
export function attendanceStartDate(row: { enrollment_date?: string | null; created_at?: string | null }): string | null {
  if (row.enrollment_date) return row.enrollment_date.slice(0, 10);
  if (row.created_at) return toLocalDateString(new Date(row.created_at));
  return null;
}

/** One status for a day across several children: present only when every expected child came. */
function combineStatuses(statuses: DayAttendanceStatus[]): DayAttendanceStatus {
  const anyIn = statuses.some((s) => s === 'present' || s === 'partial');
  const expected = statuses.filter((s) => s === 'present' || s === 'partial' || s === 'absent');
  if (anyIn) return expected.every((s) => s === 'present') ? 'present' : 'partial';
  if (statuses.includes('absent')) return 'absent';
  if (statuses.includes('excused')) return 'excused';
  if (statuses.includes('holiday')) return 'holiday';
  return 'off';
}

export function useAllChildrenAttendanceSummary(params: {
  childIds: string[];
  nurseryId?: string;
  days?: number;
}) {
  const window = useMemo(() => attendanceWindow(params.days ?? DAYS), [params.days]);
  const query = useAttendanceDays({
    childIds: params.childIds,
    from: window.from,
    to: window.to,
    enabled: Boolean(params.nurseryId),
  });

  const childRows: AllChildAttendanceRow[] = useMemo(
    () =>
      (query.data ?? []).flatMap((day) => {
        const row = toDayRow(day);
        return row ? [{ ...row, childId: day.childId }] : [];
      }),
    [query.data],
  );

  const rows: DayAttendanceRow[] = useMemo(() => {
    const byDate = new Map<string, AllChildAttendanceRow[]>();
    for (const row of childRows) {
      const list = byDate.get(row.date) ?? [];
      list.push(row);
      byDate.set(row.date, list);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, list]) => {
        const checkIns = list.map((r) => r.checkIn).filter((v): v is string => Boolean(v)).sort();
        const checkOuts = list.map((r) => r.checkOut).filter((v): v is string => Boolean(v)).sort();
        return {
          date,
          checkIn: checkIns[0] ?? null,
          checkOut: checkOuts[checkOuts.length - 1] ?? null,
          status: combineStatuses(list.map((r) => r.status)),
          latePickup: list.some((r) => r.latePickup),
          // Aggregated multi-child rows don't surface a single pickup identity.
          pickup: null,
          detail: null,
        };
      });
  }, [childRows]);

  const summary: AttendanceSummary = useMemo(() => summarizeDays(childRows), [childRows]);

  const perChildSummary = useMemo(() => {
    return params.childIds.reduce<Record<string, AttendanceSummary & {
      calendar: Array<{ date: string; status: 'present' | 'absent' | 'off' }>;
    }>>((acc, childId) => {
      const own = childRows.filter((row) => row.childId === childId);
      const calendar = own
        .slice(0, MINI_CALENDAR_DAYS)
        .reverse()
        .map((row) => ({
          date: row.date,
          status:
            row.status === 'present' || row.status === 'partial'
              ? ('present' as const)
              : row.status === 'absent'
                ? ('absent' as const)
                : ('off' as const),
        }));
      acc[childId] = { ...summarizeDays(own), calendar };
      return acc;
    }, {});
  }, [childRows, params.childIds]);

  return {
    ...query,
    rows,
    childRows,
    summary,
    perChildSummary,
  };
}
