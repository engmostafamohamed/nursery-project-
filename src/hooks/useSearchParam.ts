import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * One value kept in the address (?tab=team, ?edit=<id>), so a link, a reload or Back lands on it.
 * Setting it replaces the history entry (switching tabs is not a new page); null, or `fallback`,
 * takes it out of the address. The other parameters are kept.
 */
export function useSearchParam(key: string, fallback: string | null = null): [string | null, (next: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (next: string | null) =>
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === null || next === fallback) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      ),
    [key, fallback, setParams],
  );
  return [params.get(key) ?? fallback, set];
}
