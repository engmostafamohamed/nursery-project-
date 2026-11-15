import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { searchFamilies } from './childEnrollmentApi';

/** The families matching what the admin types, asked a moment after they stop typing (2 letters at least). */
export function useFamilySearch(nurseryId: string | null | undefined, term: string) {
  const [debounced, setDebounced] = useState(term);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(term.trim()), 300);
    return () => window.clearTimeout(id);
  }, [term]);
  return useQuery({
    queryKey: ['enrollment-families', nurseryId ?? null, debounced],
    queryFn: () => searchFamilies(nurseryId!, debounced),
    enabled: Boolean(nurseryId) && debounced.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
