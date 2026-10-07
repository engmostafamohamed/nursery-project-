import { useQuery } from '@tanstack/react-query';

import { fetchAttendanceDays } from '@/lib/attendanceApi';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { addCalendarDaysYmd, getNurseryCalendarDateString, nurseryDayStartIso } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type AttendanceDayPoint = { date: string; ratePercent: number; present: number; total: number };

export type RevenueDayPoint = { date: string; amount: number };

export type EnrollmentClassPoint = { classId: string; labelAr: string; labelEn: string; count: number };

export type AdminDashboardCharts = {
  attendance7: AttendanceDayPoint[];
  revenue30: RevenueDayPoint[];
  enrollmentByClass: EnrollmentClassPoint[];
};

export function useAdminDashboardCharts(nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['admin-dashboard-charts', nurseryId],
    queryFn: async (): Promise<AdminDashboardCharts> => {
      if (!nurseryId) {
        return { attendance7: [], revenue30: [], enrollmentByClass: [] };
      }

      const today = getNurseryCalendarDateString();
      const dayLabels: string[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        dayLabels.push(addCalendarDaysYmd(today, -i));
      }

      // Per-day status from the server (active children, working days, holidays and enrollment
      // dates handled there): the rate is present out of the children expected that day.
      const activeRes = await supabase.from('children').select('id').eq('nursery_id', nurseryId).eq('status', 'active');
      if (activeRes.error) throw activeRes.error;
      const activeIds = (activeRes.data ?? []).map((r: { id: string }) => r.id);
      const days = await fetchAttendanceDays(activeIds, dayLabels[0], today);
      const perDay = new Map<string, { present: number; total: number }>();
      for (const day of days) {
        const expected = day.status === 'present' || day.status === 'partial' || day.status === 'absent' || day.status === 'excused';
        if (!expected) continue;
        const cur = perDay.get(day.date) ?? { present: 0, total: 0 };
        cur.total += 1;
        if (day.status === 'present' || day.status === 'partial') cur.present += 1;
        perDay.set(day.date, cur);
      }
      const attendance7: AttendanceDayPoint[] = dayLabels.map((date) => {
        const { present, total } = perDay.get(date) ?? { present: 0, total: 0 };
        return { date, present, total, ratePercent: total > 0 ? Math.round((present / total) * 1000) / 10 : 0 };
      });

      const thirtyAgo = addCalendarDaysYmd(today, -29);
      const revenueByDay = new Map<string, number>();
      for (let i = 0; i < 30; i += 1) {
        revenueByDay.set(addCalendarDaysYmd(thirtyAgo, i), 0);
      }

      // Completed payments on this nursery's invoices (filtered through the invoice join), bucketed
      // by the nursery's calendar day.
      const payments = await fetchAllRows<{ amount: string | number; paid_at: string }>((start, end) =>
        supabase
          .from('payments')
          .select('id, amount, paid_at, invoices!inner(nursery_id)')
          .eq('invoices.nursery_id', nurseryId)
          .eq('status', 'completed')
          .gte('paid_at', nurseryDayStartIso(thirtyAgo))
          .order('id')
          .range(start, end)
          .returns<Array<{ amount: string | number; paid_at: string }>>(),
      );
      for (const p of payments) {
        const day = getNurseryCalendarDateString(new Date(p.paid_at));
        if (!revenueByDay.has(day)) continue;
        revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(p.amount));
      }

      const revenue30: RevenueDayPoint[] = [...revenueByDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({ date, amount }));

      const enrollRes = await supabase
        .from('children')
        .select('class_id, classes ( id, name_ar, name_en )')
        .eq('nursery_id', nurseryId)
        .eq('status', 'active');
      if (enrollRes.error) throw enrollRes.error;

      type Cl = { id: string; name_ar: string; name_en: string };
      type EnRow = { class_id: string | null; classes: Cl | Cl[] | null };
      const byClass = new Map<string, { labelAr: string; labelEn: string; count: number }>();

      for (const raw of (enrollRes.data ?? []) as EnRow[]) {
        const cid = raw.class_id ?? 'unassigned';
        const cl = raw.classes;
        const meta = Array.isArray(cl) ? cl[0] : cl;
        const labelAr = meta?.name_ar ?? 'غير مسند';
        const labelEn = meta?.name_en ?? 'Unassigned';
        const cur = byClass.get(cid) ?? { labelAr, labelEn, count: 0 };
        cur.count += 1;
        byClass.set(cid, cur);
      }

      const enrollmentByClass: EnrollmentClassPoint[] = [...byClass.entries()].map(([classId, v]) => ({
        classId,
        labelAr: v.labelAr,
        labelEn: v.labelEn,
        count: v.count,
      }));

      enrollmentByClass.sort((a, b) => b.count - a.count);

      return { attendance7, revenue30, enrollmentByClass };
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60 * 5,
  });
}
