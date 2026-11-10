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

/** A member of staff's month: their days, the nursery's school days in it (working days less holidays) and its today. */
export type StaffMonth = { today: string; schoolDays: string[]; days: StaffAttendanceDayRow[] };

function monthEndIso(month: string): string {
  const d = new Date(`${month}-01T12:00:00`);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

const day = (v: unknown) => String(v ?? '').slice(0, 10);

/**
 * A member of staff's month (YYYY-MM), by their account (get_staff_days): read through a function so
 * a day just recorded shows at once, and staff without an HR record show too.
 */
export function useStaffAttendanceMonth(userId: string | null | undefined, month: string) {
  return useQuery({
    queryKey: ['staff-attendance-month', userId ?? null, month],
    queryFn: async (): Promise<StaffMonth> => {
      if (!userId) return { today: '', schoolDays: [], days: [] };
      const { data, error } = await supabase.rpc('get_staff_days' as never, {
        p_user_id: userId,
        p_from: `${month}-01`,
        p_to: monthEndIso(month),
      } as never);
      if (error) throw error;
      const r = (data && typeof data === 'object' ? data : {}) as { today?: unknown; school_days?: unknown; days?: unknown };
      const rows = (Array.isArray(r.days) ? r.days : []) as Array<Partial<StaffAttendanceDayRow>>;
      return {
        today: day(r.today),
        schoolDays: (Array.isArray(r.school_days) ? r.school_days : []).map(day),
        days: rows.map((row) => ({
          id: String(row.id),
          work_date: day(row.work_date),
          check_in_at: row.check_in_at ?? null,
          check_out_at: row.check_out_at ?? null,
          clock_in: null,
          clock_out: null,
          status: row.status ?? null,
          notes: row.notes ?? null,
          work_hours: row.work_hours ?? null,
          late_minutes: row.late_minutes ?? null,
          source: row.source ?? null,
        })),
      };
    },
    enabled: Boolean(userId && month),
  });
}
