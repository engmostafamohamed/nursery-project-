import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const adminEventsListQueryKey = (nurseryId: string | null | undefined) =>
  ['admin-events-list', nurseryId] as const;

export type AdminEventsListStatusFilter = 'all' | 'urgent' | 'draft' | 'active' | 'completed' | 'cancelled';
export type AdminEventsListCategoryFilter = 'all' | 'trip' | 'activity' | 'service' | 'doctor_visit';
export type AdminEventsListDateFilter = 'all' | 'upcoming' | 'past';

export type AdminEventsListRow = {
  id: string;
  title_ar: string;
  title_en: string;
  starts_at: string;
  ends_at: string | null;
  category: 'trip' | 'activity' | 'service' | 'doctor_visit';
  is_urgent: boolean;
  urgent_days_of_week: number[];
  urgent_hours_of_day: number[];
  urgent_repeats_weekly: boolean;
  is_paid: boolean;
  price: string | null;
  target_scope: 'all' | 'class' | 'individual';
  status: string;
  cancelled_at: string | null;
};

export function inferEventListStatus(event: AdminEventsListRow): Exclude<AdminEventsListStatusFilter, 'all'> {
  const st = String(event.status ?? 'draft').toLowerCase();
  if (event.cancelled_at || st === 'cancelled') return 'cancelled';
  if (st === 'draft') return 'draft';
  if (st === 'completed') return 'completed';
  const now = Date.now();
  const startMs = new Date(event.starts_at).getTime();
  const endMs = event.ends_at ? new Date(event.ends_at).getTime() : startMs;
  if (endMs < now) return 'completed';
  return 'active';
}

export function useAdminEventsList({
  nurseryId,
  statusFilter,
  categoryFilter,
  dateFilter,
}: {
  nurseryId: string | undefined | null;
  statusFilter: AdminEventsListStatusFilter;
  categoryFilter: AdminEventsListCategoryFilter;
  dateFilter: AdminEventsListDateFilter;
}) {
  const queryClient = useQueryClient();
  const key = adminEventsListQueryKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<AdminEventsListRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title_ar, title_en, starts_at, ends_at, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, is_paid, price, target_scope, status, cancelled_at',
        )
        .eq('nursery_id', nurseryId)
        .order('starts_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminEventsListRow[];
    },
    enabled: Boolean(nurseryId),
  });

  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`admin-events-list-${nurseryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, queryClient, key]);

  const [nowMs] = useState(Date.now);
  const filtered = useMemo(() => {
    const rows = query.data ?? [];
    const now = nowMs;
    return rows.filter((event) => {
      const listStatus = inferEventListStatus(event);
      if (statusFilter === 'urgent') {
        if (!event.is_urgent) return false;
      } else if (statusFilter !== 'all' && listStatus !== statusFilter) return false;
      if (categoryFilter !== 'all' && event.category !== categoryFilter) return false;
      if (dateFilter === 'upcoming') {
        if (new Date(event.starts_at).getTime() <= now) return false;
      }
      if (dateFilter === 'past') {
        const endMs = event.ends_at
          ? new Date(event.ends_at).getTime()
          : new Date(event.starts_at).getTime();
        if (endMs >= now) return false;
      }
      return true;
    });
  }, [query.data, statusFilter, categoryFilter, dateFilter, nowMs]);

  return {
    ...query,
    filtered,
  };
}
