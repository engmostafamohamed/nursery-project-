import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchAdmissionTimelines, type AdmissionTimeline } from '@/lib/admissionTimeline';

/** The admission journey of each child (the server returns only children the user may see). */
export function useAdmissionTimelines(childIds: string[]) {
  const ids = useMemo(() => [...new Set(childIds)].sort(), [childIds]);
  const query = useQuery({
    queryKey: ['admission-timelines', ids],
    queryFn: () => fetchAdmissionTimelines(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  const byChild = useMemo(
    () => new Map<string, AdmissionTimeline>((query.data ?? []).map((row) => [row.childId, row])),
    [query.data],
  );
  return { ...query, byChild };
}
