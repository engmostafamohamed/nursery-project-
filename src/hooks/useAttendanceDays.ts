import { useQuery } from '@tanstack/react-query';

import { fetchAttendanceDays } from '@/lib/attendanceApi';

/**
 * Per-child, per-day attendance from get_attendance_days: the server decides which days are
 * school days (nursery working days, holidays, enrollment date) and which absences are excused,
 * so every dashboard counts the same way.
 */
export function useAttendanceDays(params: {
  childIds: string[];
  from: string;
  to: string;
  enabled?: boolean;
  /** Poll this often (ms), for live views such as today's status. History views leave it unset. */
  refetchInterval?: number;
}) {
  const ids = [...params.childIds].sort();
  return useQuery({
    queryKey: ['attendance-days', ids.join(','), params.from, params.to],
    queryFn: () => fetchAttendanceDays(ids, params.from, params.to),
    enabled: (params.enabled ?? true) && ids.length > 0 && Boolean(params.from && params.to),
    ...(params.refetchInterval ? { refetchInterval: params.refetchInterval, staleTime: 0 } : {}),
  });
}
