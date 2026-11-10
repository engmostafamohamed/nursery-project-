import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type StaffAttendanceDayRow = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  clock_in: string | null;
  clock_out: string | null;
  status: string | null;
  notes: string | null;
  work_hours: string | number | null;
  late_minutes: number | null;
  /** Clocked by the person (self) or recorded by an admin. */
  source: string | null;
};

function monthEndIso(month: string): string {
  const d = new Date(`${month}-01T12:00:00`);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

/**
 * A member of staff's days in a month (YYYY-MM), by their account (get_staff_days): read through a
 * function so a day just recorded shows at once, and staff without an HR record show too.
 */
export function useStaffAttendanceMonth(userId: string | null | undefined, month: string) {
  return useQuery({
    queryKey: ['staff-attendance-month', userId ?? null, month],
    queryFn: async (): Promise<StaffAttendanceDayRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc('get_staff_days' as never, {
        p_user_id: userId,
        p_from: `${month}-01`,
        p_to: monthEndIso(month),
      } as never);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as Array<Partial<StaffAttendanceDayRow>>;
      return rows.map((r) => ({
        id: String(r.id),
        work_date: String(r.work_date).slice(0, 10),
        check_in_at: r.check_in_at ?? null,
        check_out_at: r.check_out_at ?? null,
        clock_in: null,
        clock_out: null,
        status: r.status ?? null,
        notes: r.notes ?? null,
        work_hours: r.work_hours ?? null,
        late_minutes: r.late_minutes ?? null,
        source: r.source ?? null,
      }));
    },
    enabled: Boolean(userId && month),
  });
}
