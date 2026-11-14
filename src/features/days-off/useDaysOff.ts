import { useQuery, type QueryClient } from '@tanstack/react-query';

import { openWeekdays } from '@/lib/weekdays';

import { fetchHolidays, fetchWorkingDays } from './daysOffApi';

const ROOT = 'days-off';

/** The weekdays the nursery opens (0 = Sunday), however they are stored. */
export function useOpenWeekdays(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: [ROOT, 'week', nurseryId],
    queryFn: async () => openWeekdays(await fetchWorkingDays(nurseryId!)),
    enabled: Boolean(nurseryId),
  });
}

/** The nursery's holidays touching a year. */
export function useHolidays(nurseryId: string | null | undefined, year: number) {
  return useQuery({
    queryKey: [ROOT, 'holidays', nurseryId, year],
    queryFn: () => fetchHolidays(nurseryId!, year),
    enabled: Boolean(nurseryId),
  });
}

/**
 * After the days changed: these lists, and every screen that shows whether a day is open (attendance,
 * the dashboard, staff tasks, the menu) reads again.
 */
export function refreshDaysOff(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: [ROOT] });
  void queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === 'string' && /attendance|dashboard|staff-tasks|menu|class-profile|staff-day/.test(q.queryKey[0]),
  });
}
