import { useMemo, useState } from 'react';

export type Pagination<T> = {
  /** Current 1-based page number. */
  page: number;
  /** Total number of pages (at least 1). */
  pageCount: number;
  /** The slice of items for the current page. */
  pageItems: T[];
  /** Total number of items across all pages. */
  total: number;
  /** 1-based index of the first item shown on the current page (0 when empty). */
  startIndex: number;
  /** 1-based index of the last item shown on the current page (0 when empty). */
  endIndex: number;
  setPage: (page: number) => void;
  next: () => void;
  prev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Client-side pagination over an already-fetched array. Slices `items` into
 * pages of `pageSize` and clamps the current page when the underlying list
 * shrinks (e.g. after filtering/search), so the UI never lands on an empty
 * out-of-range page.
 *
 * Pass `resetKey` (e.g. a serialized set of active filters) to jump back to
 * page 1 whenever the filter criteria change.
 */
export function usePagination<T>(items: T[], pageSize = 20, resetKey?: unknown): Pagination<T> {
  const [page, setPageState] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Jump back to the first page whenever the caller's filter criteria change.
  // Adjusting state during render is React's recommended pattern for resetting
  // state in response to a changing input, and avoids an extra effect pass.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setPageState(1);
  }

  // Clamp for display when the list shrinks underneath us (e.g. after search).
  // `setPage`/`next`/`prev` re-clamp on the next interaction, so we never need
  // to write the clamped value back to state from an effect.
  const safePage = Math.min(page, pageCount);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, total);

  const setPage = (p: number) => setPageState(Math.min(Math.max(1, p), pageCount));

  return {
    page: safePage,
    pageCount,
    pageItems,
    total,
    startIndex,
    endIndex,
    setPage,
    next: () => setPage(safePage + 1),
    prev: () => setPage(safePage - 1),
    hasNext: safePage < pageCount,
    hasPrev: safePage > 1,
  };
}
