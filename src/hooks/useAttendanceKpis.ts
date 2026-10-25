import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { DateRange } from '@/lib/attendancePeriods';
import { supabase } from '@/lib/supabase';

export type TopLateRow = { child_id: string; full_name_ar: string; full_name_en: string; late_days: number; extra_hours: number; extra_fee: number };

export type Kpis = {
  today: {
    date: string;
    is_school_day: boolean;
    active_children: number;
    in_nursery: number;
    checked_out: number;
    checked_in_total: number;
    excused: number;
    absent: number;
    late_now: number;
    extra_hours_today: number;
    extra_fee_today: number;
  };
  month: {
    month_start: string;
    attendance_rate: number;
    present_child_days: number;
    absent_child_days: number;
    excused_child_days: number;
    late_pickups: number;
    extra_hours: number;
    extra_hours_covered: number;
    extra_hours_billed: number;
    extra_fee_billed: number;
    extra_fee_collected: number;
    extra_fee_outstanding: number;
    needs_review: number;
    qr_scans: number;
    manual_entries: number;
  };
  top_late: TopLateRow[];
};

/** Attendance and extra-hours numbers for a period (get_attendance_period_kpis). */
export type PeriodKpis = {
  from: string;
  /** The last day counted: the period's end, or today while it is still running. */
  to: string;
  school_days: number;
  expected_child_days: number;
  attendance_rate: number;
  present_child_days: number;
  absent_child_days: number;
  excused_child_days: number;
  late_pickups: number;
  /** The children who took extra hours, and on how many days in all. */
  extra_hours_children: number;
  extra_hours_days: number;
  extra_hours: number;
  extra_hours_covered: number;
  extra_hours_billed: number;
  /** The period's own extra-hours charges, of which collected (invoice paid) and outstanding (pending or overdue). */
  extra_fee_billed: number;
  extra_fee_collected: number;
  extra_fee_outstanding: number;
  needs_review: number;
  qr_scans: number;
  manual_entries: number;
  top_late: TopLateRow[];
};

/** Live attendance numbers for today and the current month (get_attendance_kpis). */
export function useAttendanceKpis(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId],
    queryFn: async (): Promise<Kpis> => {
      const { data, error } = await supabase.rpc('get_attendance_kpis' as never, { p_nursery_id: nurseryId, p_month: null } as never);
      if (error) throw error;
      return data as Kpis;
    },
    enabled: Boolean(nurseryId),
  });
}

/**
 * The numbers for the days of `range` (nothing while it is null). The previous period's numbers stay
 * on screen, marked as placeholder, while the next one loads.
 */
export function useAttendancePeriodKpis(nurseryId: string | null | undefined, range: DateRange | null) {
  return useQuery({
    queryKey: ['attendance-kpis', nurseryId, 'period', range?.from, range?.to],
    queryFn: async (): Promise<PeriodKpis> => {
      const { data, error } = await supabase.rpc(
        'get_attendance_period_kpis' as never,
        { p_nursery_id: nurseryId, p_from: range?.from, p_to: range?.to } as never,
      );
      if (error) throw error;
      return data as PeriodKpis;
    },
    enabled: Boolean(nurseryId && range),
    placeholderData: keepPreviousData,
  });
}
