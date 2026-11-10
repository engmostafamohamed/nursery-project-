import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MenuPeriod } from './menuPeriod';
import { fetchFoodAlerts } from './foodAlertsApi';
import { fetchMenu, setMenuPeriodKind, type Menu } from './menuApi';

export const fnbKeys = {
  all: ['fnb'] as const,
  /** A menu by the day asked for (any day of its period). */
  menu: (nurseryId: string | null | undefined, day: string) => ['fnb', 'menu', nurseryId, day] as const,
  alerts: (nurseryId: string | null | undefined, from: string, to: string, childId?: string) => ['fnb', 'alerts', nurseryId, from, to, childId ?? null] as const,
};

/** The menu of the period `day` falls in (a week or a month, as the nursery chooses). */
export function useMenu(nurseryId: string | null | undefined, day: string) {
  return useQuery({
    queryKey: fnbKeys.menu(nurseryId, day),
    queryFn: () => fetchMenu(nurseryId!, day),
    enabled: Boolean(nurseryId),
  });
}

/**
 * A change to a menu (save, publish, copy, file). The function returns the menu as it now is, kept
 * under its first day so the screen shows it at once; every other F&B read (alerts, the same menu
 * opened from another day) is refreshed.
 */
export function useMenuChange<TInput>(nurseryId: string | null | undefined, run: (input: TInput) => Promise<Menu>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (menu) => {
      const key = fnbKeys.menu(nurseryId, menu.startsOn);
      queryClient.setQueryData(key, menu);
      void queryClient.invalidateQueries({ queryKey: fnbKeys.all, predicate: (q) => JSON.stringify(q.queryKey) !== JSON.stringify(key) });
    },
  });
}

/** Switching the nursery's menu between a week and a month: every menu read changes period. */
export function useMenuPeriodKind(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (period: MenuPeriod) => setMenuPeriodKind(nurseryId!, period),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: fnbKeys.all }),
  });
}

export function useFoodAlerts(input: { nurseryId: string | null | undefined; from: string; to: string; childId?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: fnbKeys.alerts(input.nurseryId, input.from, input.to, input.childId),
    queryFn: () => fetchFoodAlerts({ nurseryId: input.nurseryId!, from: input.from, to: input.to, childId: input.childId }),
    enabled: Boolean(input.nurseryId) && input.enabled !== false,
  });
}
