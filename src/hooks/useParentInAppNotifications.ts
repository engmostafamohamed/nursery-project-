import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { NOTIFICATION_TEXT_COLUMNS, type NotificationTextRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';

export type ParentInAppNotificationRow = NotificationTextRow & {
  id: string;
  type: string;
  read: boolean;
  sent_at: string;
  action_link: string | null;
  urgency: 'low' | 'normal' | 'high' | null;
  image_url: string | null;
};

const selectColumns = `id, type, read, sent_at, action_link, urgency, image_url, ${NOTIFICATION_TEXT_COLUMNS}`;

export function parentInAppNotificationsQueryKey(userId: string | undefined) {
  return ['parent-in-app-notifications', userId] as const;
}

export function useParentInAppNotifications(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = parentInAppNotificationsQueryKey(userId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ParentInAppNotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select(selectColumns)
        .eq('user_id', userId)
        .or('channel.eq.in_app,channel.is.null')
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ParentInAppNotificationRow[];
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 20,
  });

  useEffect(() => {
    if (!userId) return;
    const qk = parentInAppNotificationsQueryKey(userId);
    const channel = supabase
      .channel(`parent-in-app-notifications-${userId}`)
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
