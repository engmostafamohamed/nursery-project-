import { useQuery } from '@tanstack/react-query';

import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type AdminDashboardAlerts = {
  overdueInvoices: number;
  applicationsNeedingDocs: number;
  teachersNotCheckedIn: number;
  upcomingEventsSoon: number;
};

export function useAdminDashboardAlerts(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-alerts', nurseryId],
    queryFn: async (): Promise<AdminDashboardAlerts> => {
      if (!nurseryId) {
        return {
          overdueInvoices: 0,
          applicationsNeedingDocs: 0,
          teachersNotCheckedIn: 0,
          upcomingEventsSoon: 0,
        };
      }

      const today = getNurseryCalendarDateString();

      const overdueStatusRes = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId)
        .eq('status', 'overdue');

      const overduePendingRes = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId)
        .eq('status', 'pending')
        .lt('due_date', today);

      if (overdueStatusRes.error) throw overdueStatusRes.error;
      if (overduePendingRes.error) throw overduePendingRes.error;

      const docsRes = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId)
        .in('status', ['documents_pending', 'submitted']);

      if (docsRes.error) throw docsRes.error;

      const teachersRes = await supabase
        .from('users')
        .select('id')
        .eq('nursery_id', nurseryId)
        .eq('role', 'teacher')
        .eq('status', 'active');

      if (teachersRes.error) throw teachersRes.error;
      const teacherIds = (teachersRes.data ?? []).map((r: { id: string }) => r.id);

      let teachersNotCheckedIn = 0;
      if (teacherIds.length > 0) {
        const clockRes = await supabase
          .from('staff_attendance')
          .select('user_id')
          .eq('nursery_id', nurseryId)
          .eq('work_date', today)
          .not('check_in_at', 'is', null)
          .in('user_id', teacherIds);
        if (clockRes.error) throw clockRes.error;
        const clocked = new Set((clockRes.data ?? []).map((r: { user_id: string }) => r.user_id));
        teachersNotCheckedIn = teacherIds.filter((id) => !clocked.has(id)).length;
      }

      const soonEnd = isoNowDays(5);
      const nowIso = new Date().toISOString();
      const eventsRes = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('nursery_id', nurseryId)
        .is('cancelled_at', null)
        .gte('starts_at', nowIso)
        .lte('starts_at', soonEnd);

      if (eventsRes.error) throw eventsRes.error;

      return {
        overdueInvoices: (overdueStatusRes.count ?? 0) + (overduePendingRes.count ?? 0),
        applicationsNeedingDocs: docsRes.count ?? 0,
        teachersNotCheckedIn,
        upcomingEventsSoon: eventsRes.count ?? 0,
      };
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60,
  });
}

function isoNowDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
