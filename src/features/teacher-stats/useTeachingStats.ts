/*
 * Reading how a teacher's own classes have been going. One database function answers the whole
 * fortnight, so the dashboard's charts cost one round trip.
 */
import { useQuery } from '@tanstack/react-query';

import { callRpc } from '@/lib/rpc';

import { toTeachingStats } from './teachingStats';

export const teachingStatsKey = (userId: string | null | undefined) => ['teaching-stats', userId ?? null] as const;

export function useTeachingStats(userId: string | null | undefined) {
  return useQuery({
    queryKey: teachingStatsKey(userId),
    queryFn: async () => toTeachingStats(await callRpc('get_my_teaching_stats', { p_days: 14 })),
    enabled: Boolean(userId),
  });
}
