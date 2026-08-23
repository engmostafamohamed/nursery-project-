import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/types/chat';

export function useConversationMessages(conversationId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = ['chat-messages', conversationId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('messages')
        .select(
          'id, conversation_id, sender_id, receiver_id, content, type, file_name, mime_type, file_size_bytes, read_at, created_at',
        )
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: key });
          void queryClient.invalidateQueries({ queryKey: ['chat-unread-count'] });
          void queryClient.invalidateQueries({ queryKey: ['chat-inbox'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}
