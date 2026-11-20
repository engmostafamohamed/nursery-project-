/*
 * Reading one child's whole record. A single database function answers it, so opening a child
 * costs one round trip rather than one per kind of thing that happened to her.
 */
import { useQuery } from '@tanstack/react-query';

import { callRpc } from '@/lib/rpc';

import { toChildHistory } from './childHistory';

export const childHistoryKey = (childId: string | null | undefined) => ['child-history', childId ?? null] as const;

export function useChildHistory(childId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: childHistoryKey(childId),
    queryFn: async () => toChildHistory(await callRpc('get_child_history', { p_child_id: childId })),
    enabled: enabled && Boolean(childId),
  });
}
