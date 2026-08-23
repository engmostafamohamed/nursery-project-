import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ScheduleRowInput = {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_working_day: boolean;
};

export function useStaffSchedules(params: { nurseryId?: string; staffId?: string; profileId?: string }) {
  const qc = useQueryClient();

  const scheduleQuery = useQuery({
    queryKey: ['staff-schedule', params.profileId],
    queryFn: async () => {
      if (!params.profileId) return [];
      const res = await supabase
        .from('staff_schedules')
        .select('*')
        .eq('staff_id', params.profileId)
        .order('day_of_week', { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(params.profileId),
  });

  const attendanceQuery = useQuery({
    queryKey: ['staff-attendance-history', params.profileId],
    queryFn: async () => {
      if (!params.profileId) return [];
      const res = await supabase
        .from('staff_attendance')
        .select('id, check_in_at, check_out_at, work_hours, notes, created_at')
        .eq('staff_id', params.profileId)
        .order('check_in_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(params.profileId),
  });

  const saveSchedule = useMutation({
    mutationFn: async (rows: ScheduleRowInput[]) => {
      if (!params.nurseryId || !params.profileId) throw new Error('Missing staff/nursery');
      const payload = rows.map((r) => ({
        ...r,
        nursery_id: params.nurseryId,
        staff_id: params.profileId,
      }));
      const res = await supabase.from('staff_schedules').upsert(payload as never, { onConflict: 'staff_id,day_of_week' });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-schedule'] });
    },
  });

  const totalHoursPerWeek = useMemo(() => {
    return (scheduleQuery.data ?? []).reduce((sum, row) => {
      if (!row.is_working_day || !row.start_time || !row.end_time) return sum;
      const [sh, sm] = String(row.start_time).split(':').map(Number);
      const [eh, em] = String(row.end_time).split(':').map(Number);
      return sum + Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
    }, 0);
  }, [scheduleQuery.data]);

  return {
    schedule: scheduleQuery.data ?? [],
    attendance: attendanceQuery.data ?? [],
    totalHoursPerWeek,
    saveSchedule: saveSchedule.mutateAsync,
  };
}
