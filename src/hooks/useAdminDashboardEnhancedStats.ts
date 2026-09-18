import { useQuery } from '@tanstack/react-query';

import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type AdminDashboardEnhancedStats = {
  totalChildren: number;
  /** Net new children created this calendar month */
  newChildrenThisMonth: number;
  /** Net new children created last calendar month */
  newChildrenLastMonth: number;
  presentToday: number;
  attendanceRatePercent: number;
  pendingApprovals: number;
  /**
   * pendingApprovals is the sum of three unrelated queues, so the card that shows it
   * needs the split to say where the work actually is and where to link.
   */
  pendingBreakdown: { media: number; applications: number; payments: number };
  applicationsThisMonth: number;
  revenueThisMonth: number;
};

function monthBoundsUtc() {
  const now = new Date();
  const startThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    startThisIso: startThis.toISOString(),
    startLastIso: startLast.toISOString(),
    endLastIso: startThis.toISOString(),
  };
}

export function useAdminDashboardEnhancedStats(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-enhanced-stats', nurseryId],
    queryFn: async (): Promise<AdminDashboardEnhancedStats> => {
      if (!nurseryId) {
        return {
          totalChildren: 0,
          newChildrenThisMonth: 0,
          newChildrenLastMonth: 0,
          presentToday: 0,
          attendanceRatePercent: 0,
          pendingApprovals: 0,
          pendingBreakdown: { media: 0, applications: 0, payments: 0 },
          applicationsThisMonth: 0,
          revenueThisMonth: 0,
        };
      }

      const today = getNurseryCalendarDateString();
      const { startThisIso, startLastIso, endLastIso } = monthBoundsUtc();
      const childrenCountRes = await supabase
        .from('children')
        .select('id')
        .eq('nursery_id', nurseryId);

      if (childrenCountRes.error) {
        throw childrenCountRes.error;
      }

      const newThisRes = await supabase
        .from('children')
        .select('id')
        .eq('nursery_id', nurseryId)
        .gte('created_at', startThisIso);

      if (newThisRes.error) throw newThisRes.error;

      const newLastRes = await supabase
        .from('children')
        .select('id')
        .eq('nursery_id', nurseryId)
        .gte('created_at', startLastIso)
        .lt('created_at', endLastIso);

      if (newLastRes.error) throw newLastRes.error;

      const childIdsRes = await supabase.from('children').select('id').eq('nursery_id', nurseryId);
      if (childIdsRes.error) throw childIdsRes.error;
      const childIds = (childIdsRes.data ?? []).map((r: { id: string }) => r.id);

      let presentToday = 0;
      if (childIds.length > 0) {
        const presentRes = await supabase
          .from('attendance_records')
          .select('id')
          .eq('attendance_date', today)
          .not('check_in', 'is', null)
          .in('child_id', childIds);
        if (presentRes.error) throw presentRes.error;
        presentToday = presentRes.data?.length ?? 0;
      }

      const totalActive = childrenCountRes.data?.length ?? 0;
      const attendanceRatePercent =
        totalActive > 0
          ? Math.min(100, Math.round((presentToday / totalActive) * 1000) / 10)
          : 0;

      const [mediaPend, appPend, payPend] = await Promise.allSettled([
        supabase
          .from('media')
          .select('id')
          .eq('nursery_id', nurseryId)
          .eq('status', 'pending_approval'),
        supabase
          .from('applications')
          .select('id')
          .eq('nursery_id', nurseryId)
          .in('status', ['submitted', 'under_review', 'documents_pending']),
        supabase
          .from('payment_attempts')
          .select('id')
          .eq('nursery_id', nurseryId)
          .eq('status', 'pending_confirmation'),
      ]);

      const appsThisMonthRes = await supabase
        .from('applications')
        .select('id')
        .eq('nursery_id', nurseryId)
        .gte('created_at', startThisIso);

      if (appsThisMonthRes.error) throw appsThisMonthRes.error;

      const mediaPendingCount =
        mediaPend.status === 'fulfilled' && !mediaPend.value.error
          ? (mediaPend.value.data?.length ?? 0)
          : 0;
      const appsPendingCount =
        appPend.status === 'fulfilled' && !appPend.value.error
          ? (appPend.value.data?.length ?? 0)
          : 0;
      const paymentPendingCount =
        payPend.status === 'fulfilled' && !payPend.value.error
          ? (payPend.value.data?.length ?? 0)
          : 0;

      const pendingApprovals = mediaPendingCount + appsPendingCount + paymentPendingCount;

      const invRes = await supabase.from('invoices').select('id').eq('nursery_id', nurseryId);
      if (invRes.error) throw invRes.error;
      const invoiceIds = (invRes.data ?? []).map((r: { id: string }) => r.id);

      let revenueThisMonth = 0;
      if (invoiceIds.length > 0) {
        const payRes = await supabase
          .from('payments')
          .select('amount')
          .eq('status', 'completed')
          .gte('paid_at', startThisIso)
          .in('invoice_id', invoiceIds);
        if (payRes.error) {
          throw payRes.error;
        }
        revenueThisMonth = (payRes.data ?? []).reduce(
          (sum: number, row: { amount: string | number }) => sum + Number(row.amount),
          0,
        );
      }

      return {
        totalChildren: totalActive,
        newChildrenThisMonth: newThisRes.data?.length ?? 0,
        newChildrenLastMonth: newLastRes.data?.length ?? 0,
        presentToday,
        attendanceRatePercent,
        pendingApprovals,
        pendingBreakdown: {
          media: mediaPendingCount,
          applications: appsPendingCount,
          payments: paymentPendingCount,
        },
        applicationsThisMonth: appsThisMonthRes.data?.length ?? 0,
        revenueThisMonth,
      };
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60,
  });
}
