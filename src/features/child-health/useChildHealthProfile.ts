import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fnbKeys } from '@/features/food-and-beverage/useMenu';

import { fetchChildHealthProfile } from './childHealthApi';

export const childHealthKeys = {
  profile: (childId: string | undefined) => ['child-health-profile', childId] as const,
};

export function useChildHealthProfile(childId: string | undefined) {
  return useQuery({
    queryKey: childHealthKeys.profile(childId),
    queryFn: () => fetchChildHealthProfile(childId as string),
    enabled: Boolean(childId),
  });
}

/**
 * A change to the child's health: when it is saved the profile is read again, and so are the screens
 * built from the same records (health alerts, and the menu's allergy alerts).
 */
export function useChildHealthChange<TInput>(childId: string, run: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: childHealthKeys.profile(childId) });
      void queryClient.invalidateQueries({ queryKey: ['health-alerts-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: fnbKeys.all });
    },
  });
}
