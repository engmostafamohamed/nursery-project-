import { useQuery } from '@tanstack/react-query';

import { addCalendarDaysYmd, getNurseryCalendarDateString } from '@/lib/nurseryDay';
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

      const childIdsRes = await supabase.from('children').select('id').eq('nursery_id', nurseryId);
      if (childIdsRes.error) throw childIdsRes.error;
      const childIds = (childIdsRes.data ?? []).map((r: { id: string }) => r.id);
      const total = childIds.length;

      let attendance7: AttendanceDayPoint[] = dayLabels.map((date) => ({
        date,
        ratePercent: 0,
        present: 0,
        total,
      }));

      if (childIds.length > 0) {
        const attRes = await supabase
          .from('attendance_records')
          .select('attendance_date')
          .in('child_id', childIds)
          .in('attendance_date', dayLabels)
          .not('check_in', 'is', null);
        if (attRes.error) throw attRes.error;
        const counts = new Map<string, number>();
        for (const row of attRes.data ?? []) {
          const d = (row as { attendance_date: string }).attendance_date;
          counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        attendance7 = dayLabels.map((date) => {
          const present = counts.get(date) ?? 0;
          const ratePercent = total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
          return { date, ratePercent, present, total };
        });
      }

      const thirtyAgo = addCalendarDaysYmd(today, -29);
      const invRes = await supabase.from('invoices').select('id').eq('nursery_id', nurseryId);
      if (invRes.error) throw invRes.error;
      const invoiceIds = (invRes.data ?? []).map((r: { id: string }) => r.id);

      const revenueByDay = new Map<string, number>();
      for (let i = 0; i < 30; i += 1) {
        revenueByDay.set(addCalendarDaysYmd(thirtyAgo, i), 0);
      }

      if (invoiceIds.length > 0) {
        const payRes = await supabase
          .from('payments')
          .select('amount, paid_at')
          .eq('status', 'completed')
          .gte('paid_at', `${thirtyAgo}T00:00:00`)
          .in('invoice_id', invoiceIds);
        if (payRes.error) throw payRes.error;
        for (const row of payRes.data ?? []) {
          const p = row as { amount: string | number; paid_at: string };
          const day = p.paid_at.slice(0, 10);
          if (!revenueByDay.has(day)) continue;
          revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(p.amount));
        }
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
