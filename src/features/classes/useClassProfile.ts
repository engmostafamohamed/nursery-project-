import { useQuery } from '@tanstack/react-query';

import { fetchClassProfile } from './classProfileApi';

export const classProfileKeys = {
  /** Every class profile: a change to a class's team, children or details refreshes them. */
  all: ['class-profile'] as const,
  profile: (classId: string | undefined) => [...classProfileKeys.all, classId] as const,
};

/**
 * The class and its day. Children arrive and leave all day, so it is read again on each visit
 * (after 30 seconds) and every minute while open, unlike the app's usual five-minute cache.
 */
export function useClassProfile(classId: string | undefined) {
  return useQuery({
    queryKey: classProfileKeys.profile(classId),
    queryFn: () => fetchClassProfile(classId as string),
    enabled: Boolean(classId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
