import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { DateRange } from '@/lib/attendancePeriods';
import type { AttendanceLogRow, DayChildRow, LogFilters, PeriodChildRow, PeriodDayRow, PeriodRecordRow } from '@/lib/attendanceKpiDetails';
import { supabase } from '@/lib/supabase';

// The lists behind the dashboard's attendance numbers, read only when a number is opened. Their
// keys start like the numbers' own ('attendance-kpis', nursery), so a scan refreshes both.

async function rpcRows<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Every active child's day: here, picked up, absent with or without a notice (get_attendance_day_children). */
export function useAttendanceDayChildren(nurseryId: string | null | undefined, day: string | null) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId, 'day-children', day],
    queryFn: () => rpcRows<DayChildRow>('get_attendance_day_children', { p_nursery_id: nurseryId, p_day: day }),
    enabled: Boolean(nurseryId && day),
  });
}

/** Each active child's attendance over the period (get_attendance_period_children). */
export function useAttendancePeriodChildren(nurseryId: string | null | undefined, range: DateRange | null) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId, 'period-children', range?.from, range?.to],
    queryFn: () => rpcRows<PeriodChildRow>('get_attendance_period_children', { p_nursery_id: nurseryId, p_from: range?.from, p_to: range?.to }),
    enabled: Boolean(nurseryId && range),
  });
}

/** Each school day of the period (get_attendance_period_days). */
export function useAttendancePeriodDays(nurseryId: string | null | undefined, range: DateRange | null) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId, 'period-days', range?.from, range?.to],
    queryFn: () => rpcRows<PeriodDayRow>('get_attendance_period_days', { p_nursery_id: nurseryId, p_from: range?.from, p_to: range?.to }),
    enabled: Boolean(nurseryId && range),
  });
}

/** The period's late, charged and flagged days with their invoices (get_attendance_period_records). */
export function useAttendancePeriodRecords(nurseryId: string | null | undefined, range: DateRange | null) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId, 'period-records', range?.from, range?.to],
    queryFn: () => rpcRows<PeriodRecordRow>('get_attendance_period_records', { p_nursery_id: nurseryId, p_from: range?.from, p_to: range?.to }),
    enabled: Boolean(nurseryId && range),
  });
}

/**
 * One page of the period's check-ins (get_attendance_period_log), filtered on the server by the
 * search (child name or code, a parent's name or phone), class, weekday and date. The previous page
 * stays on screen while the next one loads.
 */
export function useAttendancePeriodLog(
  nurseryId: string | null | undefined,
  range: DateRange | null,
  filters: LogFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId, 'period-log', range?.from, range?.to, filters, page, pageSize],
    queryFn: () =>
      rpcRows<AttendanceLogRow>('get_attendance_period_log', {
        p_nursery_id: nurseryId,
        p_from: range?.from,
        p_to: range?.to,
        p_search: filters.search.trim() || null,
        p_weekday: filters.weekday === 'all' ? null : filters.weekday,
        p_day: filters.day || null,
        p_class_id: filters.classId === 'all' ? null : filters.classId,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      }),
    enabled: Boolean(nurseryId && range),
    placeholderData: keepPreviousData,
  });
}
