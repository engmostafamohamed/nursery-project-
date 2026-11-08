import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchFoodAlerts, fetchMenuWeek, type MenuWeek } from './menuApi';

export const fnbKeys = {
  all: ['fnb'] as const,
  week: (nurseryId: string | null | undefined, weekStart: string) => ['fnb', 'week', nurseryId, weekStart] as const,
  alerts: (nurseryId: string | null | undefined, from: string, to: string, childId?: string) => ['fnb', 'alerts', nurseryId, from, to, childId ?? null] as const,
};

export function useMenuWeek(nurseryId: string | null | undefined, weekStart: string) {
  return useQuery({
    queryKey: fnbKeys.week(nurseryId, weekStart),
    queryFn: () => fetchMenuWeek(nurseryId!, weekStart),
    enabled: Boolean(nurseryId),
  });
}

/**
 * A change to a week (save, publish, copy, file). The function returns the week as it now is, so
 * the screen shows it at once; every other F&B read (alerts, other weeks) is refreshed.
 */
export function useMenuChange<TInput>(nurseryId: string | null | undefined, run: (input: TInput) => Promise<MenuWeek>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (week) => {
      queryClient.setQueryData(fnbKeys.week(nurseryId, week.weekStart), week);
      void queryClient.invalidateQueries({ queryKey: fnbKeys.all, predicate: (q) => q.queryKey[1] !== 'week' || q.queryKey[3] !== week.weekStart });
    },
  });
}

export function useFoodAlerts(input: { nurseryId: string | null | undefined; from: string; to: string; childId?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: fnbKeys.alerts(input.nurseryId, input.from, input.to, input.childId),
    queryFn: () => fetchFoodAlerts({ nurseryId: input.nurseryId!, from: input.from, to: input.to, childId: input.childId }),
    enabled: Boolean(input.nurseryId) && input.enabled !== false,
  });
}
