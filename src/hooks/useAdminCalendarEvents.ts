import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type CalendarEventItem = {
  id: string;
  title_ar: string;
  title_en: string;
  category: 'activity' | 'trip' | 'doctor_visit' | 'service';
  starts_at: string;
  ends_at: string | null;
  location: string | null;
};

export function useAdminCalendarEvents({
  nurseryId,
  monthStartIso,
  monthEndIso,
}: {
  nurseryId: string | undefined | null;
  monthStartIso: string;
  monthEndIso: string;
}) {
  return useQuery({
    queryKey: ['admin-calendar-events', nurseryId, monthStartIso, monthEndIso],
    queryFn: async (): Promise<CalendarEventItem[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('events')
        .select('id, title_ar, title_en, category, starts_at, ends_at, location')
        .eq('nursery_id', nurseryId)
        .gte('starts_at', monthStartIso)
        .lt('starts_at', monthEndIso)
        .is('cancelled_at', null)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarEventItem[];
    },
    enabled: Boolean(nurseryId),
  });
}
