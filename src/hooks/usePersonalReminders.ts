import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const personalRemindersKey = (userId: string | null | undefined) =>
  ['personal-reminders', userId] as const;

export type ReminderAudience = 'admin' | 'teacher';

export type PersonalReminder = {
  id: string;
  nursery_id: string;
  user_id: string;
  audience: ReminderAudience;
  name: string;
  description: string;
  days_of_week: number[];
  hours_of_day: number[];
  repeats: boolean;
  active: boolean;
  created_at: string;
};

export type PersonalReminderInput = {
  audience: ReminderAudience;
  name: string;
  description: string;
  days_of_week: number[];
  hours_of_day: number[];
  repeats: boolean;
  active: boolean;
};

/**
 * Personal (self-service) reminders for the signed-in admin or teacher.
 * Scoped to the current user via RLS (owner-only) and the user_id filter.
 * A pg_cron job (run_personal_reminders) fires the in-app notifications.
 */
export function usePersonalReminders(
  userId: string | null | undefined,
  nurseryId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const key = personalRemindersKey(userId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<PersonalReminder[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('personal_reminders')
        .select(
          'id, nursery_id, user_id, audience, name, description, days_of_week, hours_of_day, repeats, active, created_at',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PersonalReminder[];
    },
    enabled: Boolean(userId),
  });

  const create = useMutation({
    mutationFn: async (input: PersonalReminderInput) => {
      if (!userId || !nurseryId) throw new Error('Missing user or nursery');
      const { error } = await supabase
        .from('personal_reminders')
        .insert({ ...input, user_id: userId, nursery_id: nurseryId } as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PersonalReminderInput }) => {
      const { error } = await supabase
        .from('personal_reminders')
        .update(input as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_reminders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`personal-reminders-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personal_reminders',
          filter: `user_id=eq.${userId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient, key]);

  return { query, create, update, remove };
}
