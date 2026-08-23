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
};

function monthEndIso(month: string): string {
  const d = new Date(`${month}-01T12:00:00`);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

export function useStaffAttendanceMonth(staffProfileId: string | undefined, month: string) {
  return useQuery({
    queryKey: ['staff-attendance-month', staffProfileId, month],
    queryFn: async (): Promise<StaffAttendanceDayRow[]> => {
      if (!staffProfileId) return [];
      const start = `${month}-01`;
      const end = monthEndIso(month);
      const res = await supabase
        .from('staff_attendance')
        .select('id, work_date, check_in_at, check_out_at, clock_in, clock_out, status, notes, work_hours')
        .eq('staff_id', staffProfileId)
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date', { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as StaffAttendanceDayRow[];
    },
    enabled: Boolean(staffProfileId && month),
  });
}
