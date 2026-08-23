import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type AdminInAppNotificationRow = {
  id: string;
  type: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  read: boolean;
  sent_at: string;
  action_link: string | null;
};

const selectColumns =
  'id, type, title_ar, title_en, body_ar, body_en, read, sent_at, action_link';

export function adminInAppNotificationsQueryKey(userId: string | undefined) {
  return ['admin-in-app-notifications', userId] as const;
}

export function useAdminInAppNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = adminInAppNotificationsQueryKey(userId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<AdminInAppNotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select(selectColumns)
        .eq('user_id', userId)
        .or('channel.eq.in_app,channel.is.null')
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminInAppNotificationRow[];
    },
    enabled: Boolean(userId),
    // Realtime subscription keeps this fresh — no need to poll aggressively.
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!userId) return;
    const qk = adminInAppNotificationsQueryKey(userId);
    const channel = supabase
      .channel(`admin-in-app-notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: qk });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return query;
}
