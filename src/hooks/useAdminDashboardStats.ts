import { useQuery } from '@tanstack/react-query';

import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type AdminDashboardStats = {
  totalChildren: number;
  totalStaff: number;
  presentToday: number;
};

export function useAdminDashboardStats(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-stats', nurseryId],
    queryFn: async (): Promise<AdminDashboardStats> => {
      if (!nurseryId) {
        return { totalChildren: 0, totalStaff: 0, presentToday: 0 };
      }

      const today = getNurseryCalendarDateString();

      const childrenRes = await supabase
        .from('children')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId);

      if (childrenRes.error) throw childrenRes.error;

      const staffRes = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId)
        .in('role', ['teacher', 'branch_admin', 'chain_super_admin']);

      if (staffRes.error) throw staffRes.error;

      const childIdsRes = await supabase
        .from('children')
        .select('id')
        .eq('nursery_id', nurseryId);
      if (childIdsRes.error) throw childIdsRes.error;
      const childIds = (childIdsRes.data ?? []).map((r: { id: string }) => r.id);

      let presentToday = 0;
      if (childIds.length > 0) {
        const presentRes = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('attendance_date', today)
          .not('check_in', 'is', null)
          .in('child_id', childIds);
        if (presentRes.error) throw presentRes.error;
        presentToday = presentRes.count ?? 0;
      }

      return {
        totalChildren: childrenRes.count ?? 0,
        totalStaff: staffRes.count ?? 0,
        presentToday,
      };
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60,
  });
}
