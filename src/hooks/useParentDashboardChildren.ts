import { useQuery } from '@tanstack/react-query';

import { fetchAttendanceDays } from '@/lib/attendanceApi';
import { formatMealsSummary, formatMoodSummary } from '@/lib/parentDashboardFormat';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

export type ParentDashboardChildCard = {
  id: string;
  nameAr: string;
  nameEn: string;
  avatarUrl: string | null;
  checkIn: string | null;
  checkOut: string | null;
  /** off: the nursery is closed today (weekend or holiday), so the child is not absent. */
  attendanceLabel: 'absent' | 'checked_in' | 'checked_out' | 'off';
  lastReportMood: string;
  lastReportMeals: string;
  lastReportDate: string | null;
};

export function useParentDashboardChildren(parentId: string | undefined, nurseryId: string | undefined) {
  return useQuery({
    queryKey: ['parent-dashboard-children', parentId, nurseryId],
    queryFn: async (): Promise<ParentDashboardChildCard[]> => {
      if (!parentId || !nurseryId) return [];

      const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', parentId);
      if (linksRes.error) throw linksRes.error;
      const applicationChildrenRes = await supabase
        .from('applications')
        .select('child_id')
        .eq('parent_id', parentId)
        .eq('nursery_id', nurseryId)
        .eq('status', 'approved');
      if (applicationChildrenRes.error) throw applicationChildrenRes.error;

      const linkedChildIds = ((linksRes.data ?? []) as { child_id: string }[]).map((l) => l.child_id);
      const approvedApplicationChildIds = ((applicationChildrenRes.data ?? []) as { child_id: string | null }[])
        .map((row) => row.child_id)
        .filter((id): id is string => Boolean(id));
      const childIds = [...new Set([...linkedChildIds, ...approvedApplicationChildIds])];
      if (!childIds.length) return [];

      const childRes = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, avatar_url')
        .eq('nursery_id', nurseryId)
        .in('id', childIds);
      if (childRes.error) throw childRes.error;
      const children = (childRes.data ?? []) as Array<{
        id: string;
        full_name_ar: string;
        full_name_en: string;
        avatar_url: string | null;
      }>;

      const today = getNurseryCalendarDateString();

      // Today's status from the server, which knows the nursery's working days and holidays.
      const attByChild = new Map((await fetchAttendanceDays(childIds, today, today)).map((day) => [day.childId, day]));

      const reportRes = await supabase
        .from('daily_reports')
        .select('child_id, report_date, meals_json, mood_json, updated_at')
        .eq('nursery_id', nurseryId)
        .eq('status', 'published')
        .in('child_id', childIds)
        .order('report_date', { ascending: false });
      if (reportRes.error) throw reportRes.error;

      const lastReportByChild = new Map<
        string,
        { report_date: string; meals_json: Record<string, unknown>; mood_json: Record<string, unknown> }
      >();
      for (const row of reportRes.data ?? []) {
        const r = row as {
          child_id: string;
          report_date: string;
          meals_json: Record<string, unknown> | null;
          mood_json: Record<string, unknown> | null;
        };
        if (!lastReportByChild.has(r.child_id)) {
          lastReportByChild.set(r.child_id, {
            report_date: r.report_date,
            meals_json: r.meals_json ?? {},
            mood_json: r.mood_json ?? {},
          });
        }
      }

      return children.map((c) => {
        const att = attByChild.get(c.id);
        const checkIn = att?.checkIn ?? null;
        const checkOut = att?.checkOut ?? null;
        let attendanceLabel: ParentDashboardChildCard['attendanceLabel'] = 'absent';
        if (checkIn) attendanceLabel = checkOut ? 'checked_out' : 'checked_in';
        else if (att?.status === 'off' || att?.status === 'holiday') attendanceLabel = 'off';

        const lr = lastReportByChild.get(c.id);
        return {
          id: c.id,
          nameAr: c.full_name_ar,
          nameEn: c.full_name_en,
          avatarUrl: c.avatar_url,
          checkIn,
          checkOut,
          attendanceLabel,
          lastReportMood: lr ? formatMoodSummary(lr.mood_json) : '',
          lastReportMeals: lr ? formatMealsSummary(lr.meals_json) : '',
          lastReportDate: lr?.report_date ?? null,
        };
      });
    },
    enabled: Boolean(parentId && nurseryId),
    staleTime: 1000 * 60,
  });
}
