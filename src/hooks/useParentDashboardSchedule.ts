import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentScheduleTodayEvent = {
  id: string;
  titleAr: string;
  titleEn: string;
  startsAt: string;
  location: string | null;
};

export type ParentScheduleUpcoming = ParentScheduleTodayEvent;

export type ParentPickupReminder = {
  standardEndTime: string | null;
  nurseryClosesAt: string | null;
};

export function useParentDashboardSchedule(
  parentId: string | undefined,
  nurseryId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['parent-dashboard-schedule', parentId, nurseryId],
    queryFn: async (): Promise<{
      todayEvents: ParentScheduleTodayEvent[];
      upcoming: ParentScheduleUpcoming[];
      pickup: ParentPickupReminder;
    }> => {
      if (!parentId || !nurseryId) {
        return { todayEvents: [], upcoming: [], pickup: { standardEndTime: null, nurseryClosesAt: null } };
      }

      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(startToday);
      endToday.setHours(23, 59, 59, 999);
      const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString();

      const [evTodayRes, evUpcomingRes, settingsRes, nurseryRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, title_ar, title_en, starts_at, location')
          .eq('nursery_id', nurseryId)
          .is('cancelled_at', null)
          .neq('status', 'cancelled')
          .gte('starts_at', startToday.toISOString())
          .lte('starts_at', endToday.toISOString())
          .order('starts_at', { ascending: true }),
        supabase
          .from('events')
          .select('id, title_ar, title_en, starts_at, location')
          .eq('nursery_id', nurseryId)
          .is('cancelled_at', null)
          .neq('status', 'cancelled')
          .gt('starts_at', endToday.toISOString())
          .lte('starts_at', weekAhead)
          .order('starts_at', { ascending: true })
          .limit(8),
        supabase.from('nursery_settings').select('standard_end_time').eq('nursery_id', nurseryId).maybeSingle(),
        supabase.from('nurseries').select('closes_at').eq('id', nurseryId).maybeSingle(),
      ]);

      if (evTodayRes.error) throw evTodayRes.error;
      if (evUpcomingRes.error) throw evUpcomingRes.error;

      type EventRow = {
        id: string;
        title_ar: string | null;
        title_en: string | null;
        starts_at: string;
        location: string | null;
      };

      const mapEvent = (row: EventRow): ParentScheduleTodayEvent => ({
        id: row.id,
        titleAr: row.title_ar ?? '',
        titleEn: row.title_en ?? '',
        startsAt: row.starts_at,
        location: row.location,
      });

      const todayEvents = ((evTodayRes.data ?? []) as EventRow[]).map(mapEvent);
      const upcoming = ((evUpcomingRes.data ?? []) as EventRow[]).map(mapEvent);

      const settings = settingsRes.data as { standard_end_time: string | null } | null;
      const nur = nurseryRes.data as { closes_at: string | null } | null;

      return {
        todayEvents,
        upcoming,
        pickup: {
          standardEndTime: settings?.standard_end_time ?? null,
          nurseryClosesAt: nur?.closes_at ?? null,
        },
      };
    },
    enabled: Boolean(parentId && nurseryId),
    staleTime: 1000 * 120,
  });
}
