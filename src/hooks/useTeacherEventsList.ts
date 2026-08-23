import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type TeacherEventsListRow = {
  id: string;
  title_ar: string;
  title_en: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  category: 'trip' | 'activity' | 'service' | 'doctor_visit';
  is_paid: boolean;
  price: string | null;
  target_scope: 'all' | 'class' | 'individual';
  target_class_id: string | null;
  permission_deadline: string | null;
};

export function useTeacherEventsList({
  userId,
  nurseryId,
}: {
  userId: string | undefined;
  nurseryId: string | undefined | null;
}) {
  const queryClient = useQueryClient();

  // Step 1: resolve teacher's assigned class IDs
  const classIdsQuery = useQuery({
    queryKey: ['teacher-class-ids', userId],
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('class_staff')
        .select('class_id')
        .eq('user_id', userId);
      if (error) throw error;
      return [...new Set((data ?? []).map((r: { class_id: string }) => r.class_id))];
    },
    enabled: Boolean(userId),
  });

  const classIds = classIdsQuery.data ?? [];
  const eventsKey = ['teacher-events-list', userId, nurseryId] as const;

  // Step 2: fetch events visible to this teacher
  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: async (): Promise<TeacherEventsListRow[]> => {
      if (!nurseryId) return [];

      const baseQuery = supabase
        .from('events')
        .select(
          'id, title_ar, title_en, starts_at, ends_at, location, category, is_paid, price, target_scope, target_class_id, permission_deadline',
        )
        .eq('nursery_id', nurseryId)
        .eq('status', 'active')
        .is('cancelled_at', null)
        .order('starts_at', { ascending: false });

      // Events targeting 'all' children in the nursery are always visible.
      // Events targeting a specific class are visible only if it's one of teacher's classes.
      // Run both queries in parallel and merge.
      const [allScopeRes, classScopeRes] = await Promise.all([
        baseQuery.eq('target_scope', 'all'),
        classIds.length
          ? supabase
              .from('events')
              .select(
                'id, title_ar, title_en, starts_at, ends_at, location, category, is_paid, price, target_scope, target_class_id, permission_deadline',
              )
              .eq('nursery_id', nurseryId)
              .eq('status', 'active')
              .is('cancelled_at', null)
              .eq('target_scope', 'class')
              .in('target_class_id', classIds)
              .order('starts_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (allScopeRes.error) throw allScopeRes.error;
      if (classScopeRes.error) throw classScopeRes.error;

      const seen = new Set<string>();
      const merged: TeacherEventsListRow[] = [];
      for (const row of [...(allScopeRes.data ?? []), ...(classScopeRes.data ?? [])]) {
        const r = row as TeacherEventsListRow;
        if (!seen.has(r.id)) {
          seen.add(r.id);
          merged.push(r);
        }
      }
      merged.sort(
        (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
      );
      return merged;
    },
    enabled: Boolean(nurseryId) && !classIdsQuery.isPending,
  });

  // Real-time refresh when any event changes
  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`teacher-events-list-${userId ?? 'anon'}-${nurseryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => void queryClient.invalidateQueries({ queryKey: eventsKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, userId, queryClient, eventsKey]);

  return {
    ...eventsQuery,
    classIds,
    classIdsLoading: classIdsQuery.isPending,
  };
}
