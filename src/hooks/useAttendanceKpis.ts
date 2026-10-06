import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

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
  top_late: Array<{ child_id: string; full_name_ar: string; full_name_en: string; late_days: number; extra_hours: number; extra_fee: number }>;
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
