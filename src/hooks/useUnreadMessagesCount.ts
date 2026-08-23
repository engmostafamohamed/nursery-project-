import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useUnreadMessagesCount(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ['chat-unread-count', userId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 20,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread-count-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: key });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return query;
}
