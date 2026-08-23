import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const adminEventPermissionStatsKey = (eventIds: string[]) =>
  ['admin-event-permission-stats', [...eventIds].sort().join(',')] as const;

export type EventPermissionStats = {
  total: number;
  pending: number;
  granted: number;
  denied: number;
};

export function useAdminEventPermissionStats(eventIds: string[]) {
  return useQuery({
    queryKey: adminEventPermissionStatsKey(eventIds),
    queryFn: async (): Promise<Record<string, EventPermissionStats>> => {
      if (!eventIds.length) return {};
      const { data, error } = await supabase
        .from('permissions')
        .select('event_id, status')
        .in('event_id', eventIds);
      if (error) throw error;
      const map: Record<string, EventPermissionStats> = {};
      for (const id of eventIds) {
        map[id] = { total: 0, pending: 0, granted: 0, denied: 0 };
      }
      for (const row of (data ?? []) as { event_id: string | null; status: string }[]) {
        const eid = row.event_id;
        if (!eid || !map[eid]) continue;
        const s = map[eid];
        s.total += 1;
        if (row.status === 'pending') s.pending += 1;
        else if (row.status === 'granted') s.granted += 1;
        else if (row.status === 'denied') s.denied += 1;
      }
      return map;
    },
    enabled: eventIds.length > 0,
  });
}
