import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const FEED_KEYS = [
  'admin-dashboard-activity-feed',
  'admin-dashboard-enhanced-stats',
  'admin-dashboard-charts',
  'admin-dashboard-alerts',
] as const;

function invalidateDashboard(client: QueryClient, nurseryId: string) {
  for (const key of FEED_KEYS) {
    void client.invalidateQueries({ queryKey: [key, nurseryId] });
  }
}

/**
 * Subscribes to inserts on nursery-scoped tables so the dashboard refreshes without a full reload.
 * Requires Realtime enabled for these tables in the Supabase project.
 */
export function useAdminDashboardRealtime(nurseryId: string | undefined, queryClient: QueryClient) {
  useEffect(() => {
    if (!nurseryId) return;

    const channel = supabase
      .channel(`admin-dashboard-${nurseryId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'children', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inquiries', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'media', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_reports', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'applications', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payments' },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payment_attempts', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `nursery_id=eq.${nurseryId}` },
        () => invalidateDashboard(queryClient, nurseryId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, queryClient]);
}
