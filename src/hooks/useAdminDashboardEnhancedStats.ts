import { useQuery } from '@tanstack/react-query';

import type { Kpis } from '@/hooks/useAttendanceKpis';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { addCalendarDaysYmd, getNurseryCalendarDateString, nurseryDayStartIso } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type AdminDashboardEnhancedStats = {
  /** Active children (enrolled and not withdrawn, graduated, pending or archived). */
  totalChildren: number;
  /** Net new children created this calendar month */
  newChildrenThisMonth: number;
  /** Net new children created last calendar month */
  newChildrenLastMonth: number;
  presentToday: number;
  /** Children expected today: active and already enrolled. */
  expectedToday: number;
  /** Present out of expected today; null when the nursery is closed or the numbers could not load. */
  attendanceRatePercent: number | null;
  /** Today is not one of the nursery's working days (weekend or holiday). */
  closedToday: boolean;
  pendingApprovals: number;
  /**
   * pendingApprovals is the sum of three unrelated queues, so the card that shows it
   * needs the split to say where the work actually is and where to link.
   */
  pendingBreakdown: { media: number; applications: number; payments: number };
  applicationsThisMonth: number;
  revenueThisMonth: number;
};

/** Start of this and last calendar month in the nursery's timezone, as UTC instants. */
function monthBounds() {
  const today = getNurseryCalendarDateString();
  const thisMonth = `${today.slice(0, 7)}-01`;
  const lastMonth = `${addCalendarDaysYmd(thisMonth, -1).slice(0, 7)}-01`;
  return { startThisIso: nurseryDayStartIso(thisMonth), startLastIso: nurseryDayStartIso(lastMonth) };
}

/** Row count only: no rows are transferred, so it is exact however many there are. */
async function countRows(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
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
          expectedToday: 0,
          attendanceRatePercent: null,
          closedToday: false,
          pendingApprovals: 0,
          pendingBreakdown: { media: 0, applications: 0, payments: 0 },
          applicationsThisMonth: 0,
          revenueThisMonth: 0,
        };
      }

      const { startThisIso, startLastIso } = monthBounds();
      const children = () => supabase.from('children').select('id', { count: 'exact', head: true }).eq('nursery_id', nurseryId);

      const [totalChildren, newChildrenThisMonth, newChildrenLastMonth, applicationsThisMonth, kpis, payments] = await Promise.all([
        countRows(children().eq('status', 'active')),
        countRows(children().gte('created_at', startThisIso)),
        countRows(children().gte('created_at', startLastIso).lt('created_at', startThisIso)),
        countRows(
          supabase.from('applications').select('id', { count: 'exact', head: true }).eq('nursery_id', nurseryId).gte('created_at', startThisIso),
        ),
        // Today's attendance from the same server function as the attendance panel, so the two agree
        // (active children only, days off and enrollment dates handled on the server).
        // If it fails, the attendance card shows "-" and the other cards still load.
        supabase.rpc('get_attendance_kpis' as never, { p_nursery_id: nurseryId, p_month: null } as never).then(
          ({ data, error }) => (error ? null : (data as Kpis)),
          () => null,
        ),
        // Completed payments this month on this nursery's invoices (filtered through the invoice join).
        fetchAllRows<{ amount: string | number }>((start, end) =>
          supabase
            .from('payments')
            .select('id, amount, invoices!inner(nursery_id)')
            .eq('invoices.nursery_id', nurseryId)
            .eq('status', 'completed')
            .gte('paid_at', startThisIso)
            .order('id')
            .range(start, end)
            .returns<Array<{ amount: string | number }>>(),
        ),
      ]);

      // A queue the user cannot read (permissions) counts as empty rather than failing the dashboard.
      const [media, applications, paymentsPending] = await Promise.all(
        [
          supabase.from('media').select('id', { count: 'exact', head: true }).eq('nursery_id', nurseryId).eq('status', 'pending_approval'),
          supabase
            .from('applications')
            .select('id', { count: 'exact', head: true })
            .eq('nursery_id', nurseryId)
            .in('status', ['submitted', 'under_review', 'documents_pending']),
          supabase
            .from('payment_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('nursery_id', nurseryId)
            .eq('status', 'pending_confirmation'),
        ].map((query) => countRows(query).catch(() => 0)),
      );

      const today = kpis?.today;
      const expectedToday = today?.is_school_day ? today.active_children : 0;
      const presentToday = today?.checked_in_total ?? 0;

      return {
        totalChildren,
        newChildrenThisMonth,
        newChildrenLastMonth,
        presentToday,
        expectedToday,
        attendanceRatePercent: expectedToday > 0 ? Math.min(100, Math.round((presentToday / expectedToday) * 1000) / 10) : null,
        closedToday: today?.is_school_day === false,
        pendingApprovals: media + applications + paymentsPending,
        pendingBreakdown: { media, applications, payments: paymentsPending },
        applicationsThisMonth,
        revenueThisMonth: payments.reduce((sum, row) => sum + Number(row.amount), 0),
      };
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60,
  });
}
