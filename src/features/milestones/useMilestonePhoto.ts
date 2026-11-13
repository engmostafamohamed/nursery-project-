import { useQuery } from '@tanstack/react-query';

import { milestonePhotoUrl } from './milestonesApi';

/** The link to show a milestone's photo (signed links last an hour; kept for 50 minutes). */
export function useMilestonePhoto(photo: string | null | undefined) {
  return useQuery({
    queryKey: ['milestone-photo', photo],
    queryFn: () => milestonePhotoUrl(photo as string),
    enabled: Boolean(photo),
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
  }).data;
}
