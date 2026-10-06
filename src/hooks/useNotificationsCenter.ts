import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { NOTIFICATION_TEXT_COLUMNS, type NotificationTextRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';

export type NotificationItem = NotificationTextRow & {
  id: string;
  type: string;
  read: boolean;
  sent_at: string;
  action_link: string | null;
};

export function useNotificationsCenter(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ['notifications-center', userId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select(`id, type, read, sent_at, action_link, ${NOTIFICATION_TEXT_COLUMNS}`)
        .eq('user_id', userId)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotificationItem[];
    },
    enabled: Boolean(userId),
    // Realtime subscription keeps this fresh — no need to poll aggressively.
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return query;
}
