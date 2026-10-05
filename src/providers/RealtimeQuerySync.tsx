import { useQueryClient, type Query } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthSession } from '@/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';

/** Coalesces bursts (a save usually touches several rows/tables) into one refresh. */
const REFRESH_DEBOUNCE_MS = 600;

/**
 * Queries whose data is regenerated rather than read (fresh signed URLs every fetch):
 * refreshing them on unrelated changes would only make images and files reload.
 */
const EXCLUDED_QUERY_ROOTS = new Set(['chat-image-urls', 'chat-file-urls']);

const shouldRefresh = (query: Query) => !EXCLUDED_QUERY_ROOTS.has(String(query.queryKey[0]));

/**
 * App-wide live updates: listens to every change Postgres broadcasts on the public schema
 * (only rows the signed-in user may read reach the browser; Realtime applies RLS) and
 * refreshes cached queries, so any page shows other users' changes without a reload.
 *
 * Queries on screen refetch right away; the rest are marked stale and refetch when next shown.
 * Tables must be in the `supabase_realtime` publication — see migration
 * 20261005000000_realtime_all_app_tables.sql.
 */
export function RealtimeQuerySync() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let missedWhileHidden = false;
    let hasSubscribed = false;

    const refresh = () => {
      timer = undefined;
      // A background tab doesn't need to refetch; catch up once it's visible again.
      if (document.visibilityState === 'hidden') {
        missedWhileHidden = true;
        return;
      }
      void queryClient.invalidateQueries({ predicate: shouldRefresh });
    };
    const scheduleRefresh = () => {
      if (timer === undefined) timer = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !missedWhileHidden) return;
      missedWhileHidden = false;
      scheduleRefresh();
    };

    const channel = supabase
      .channel(`realtime-query-sync-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, scheduleRefresh)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // Changes made while the socket was down were never delivered; refresh once after reconnecting.
        if (hasSubscribed) scheduleRefresh();
        hasSubscribed = true;
      });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return null;
}
