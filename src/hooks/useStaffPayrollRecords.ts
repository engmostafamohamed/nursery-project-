import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useStaffPayrollRecords(nurseryId: string | undefined, staffProfileId: string | undefined) {
  return useQuery({
    queryKey: ['staff-payroll-records', nurseryId, staffProfileId],
    queryFn: async () => {
      if (!nurseryId || !staffProfileId) return [];
      const res = await supabase
        .from('staff_payroll')
        .select('*')
        .eq('nursery_id', nurseryId)
        .eq('staff_id', staffProfileId)
        .order('pay_period_start', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(nurseryId && staffProfileId),
  });
}
