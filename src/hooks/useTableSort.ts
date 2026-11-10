import { useCallback, useState } from 'react';

import type { ThSort } from '@/components/ui/DataTable';

export type SortDirection = 'asc' | 'desc';

/**
 * A table's sort: which column and which way. `sortFor(key)` is what a sortable <Th sort> takes
 * (clicking the active column flips it, another column starts ascending); `sorted` orders rows with
 * a compare per column; `key` changes whenever the sort does (for a pager's reset key).
 */
export function useTableSort<K extends string>(initial: K, initialDirection: SortDirection = 'asc') {
  const [sortBy, setSortBy] = useState<K>(initial);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  const toggle = useCallback(
    (key: K) => {
      if (key === sortBy) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      else {
        setSortBy(key);
        setDirection('asc');
      }
    },
    [sortBy],
  );

  const sortFor = (key: K): ThSort => ({ active: sortBy === key, direction, onToggle: () => toggle(key) });

  /** The rows in the chosen order; `compare` gives each column's ascending order. */
  const sorted = <T,>(rows: T[], compare: Record<K, (a: T, b: T) => number>): T[] => {
    const sign = direction === 'asc' ? 1 : -1;
    const by = compare[sortBy];
    return [...rows].sort((a, b) => by(a, b) * sign);
  };

  return { sortBy, direction, sortFor, sorted, key: `${sortBy}:${direction}` };
}
