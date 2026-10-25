import { useQuery } from '@tanstack/react-query';

import type { ChildToday } from '@/lib/parentAttendance';
import { supabase } from '@/lib/supabase';

/**
 * Each child's day right now (get_children_today): here since, picked up at, absent; when they are
 * due to be picked up and whether they are in extra hours now. Refreshed every minute.
 */
export function useChildrenToday(childIds: string[]) {
  const ids = [...childIds].sort();
  return useQuery({
    queryKey: ['children-today', ids.join(',')],
    queryFn: async (): Promise<ChildToday[]> => {
      const { data, error } = await supabase.rpc('get_children_today' as never, { p_child_ids: ids } as never);
      if (error) throw error;
      return (data ?? []) as ChildToday[];
    },
    enabled: ids.length > 0,
    refetchInterval: 60_000,
  });
}

/** Each child's unique code (CH-2026-00012), by child id. */
export function useChildCodes(childIds: string[]) {
  const ids = [...childIds].sort();
  return useQuery({
    queryKey: ['child-codes', ids.join(',')],
    queryFn: async (): Promise<Map<string, string | null>> => {
      const { data, error } = await supabase.from('children').select('id, child_id_number').in('id', ids);
      if (error) throw error;
      return new Map(((data ?? []) as Array<{ id: string; child_id_number: string | null }>).map((row) => [row.id, row.child_id_number]));
    },
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
  });
}
