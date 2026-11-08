import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchPlatformDashboard } from './platformDashboard';

export const platformDashboardQueryKey = ['xo-admin', 'platform-dashboard'] as const;

/** The whole platform's numbers for the XO home page; a refresh keeps the last ones on screen. */
export function usePlatformDashboard() {
  return useQuery({
    queryKey: platformDashboardQueryKey,
    queryFn: fetchPlatformDashboard,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });
}
