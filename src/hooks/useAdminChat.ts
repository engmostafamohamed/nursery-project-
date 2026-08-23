import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ChatConversation = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  is_read_only: boolean;
  member_count: number;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_admin: boolean;
  can_write: boolean;
  other_name_ar: string | null;
  other_name_en: string | null;
  other_role: string | null;
};

export type ChatThreadMessage = {
  id: string;
  sender_id: string;
  sender_name_ar: string | null;
  sender_name_en: string | null;
  content: string | null;
  type: string;
  moderation: 'removed' | 'disabled' | null;
  created_at: string;
};

export type ChatMember = {
  user_id: string;
  name_ar: string | null;
  name_en: string | null;
  role: string;
  is_admin: boolean;
  can_write: boolean;
};

export type ChatDirectoryEntry = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  role: string;
};

const conversationsKey = (userId: string | undefined) => ['admin-chat-conversations', userId] as const;
const threadKey = (conversationId: string | null) => ['admin-chat-thread', conversationId] as const;
const membersKey = (conversationId: string | null) => ['admin-chat-members', conversationId] as const;

/** All of the signed-in user's (non-hidden) conversations, live. */
export function useChatConversations(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = conversationsKey(userId);

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    queryFn: async (): Promise<ChatConversation[]> => {
      const { data, error } = await supabase.rpc('list_chat_conversations' as never);
      if (error) throw error;
      return (data ?? []) as ChatConversation[];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`admin-chat-list-${userId}`)
      // RLS gates these events to rows the user may see.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () =>
        queryClient.invalidateQueries({ queryKey: key }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversation_members', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return query;
}

/** Messages of one conversation, live. */
export function useChatThread(conversationId: string | null) {
  const queryClient = useQueryClient();
  const key = threadKey(conversationId);

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<ChatThreadMessage[]> => {
      const { data, error } = await supabase.rpc('list_chat_messages' as never, { p_conv: conversationId } as never);
      if (error) throw error;
      return (data ?? []) as ChatThreadMessage[];
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`admin-chat-thread-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return query;
}

/** Roster (with per-member permissions) of one conversation. */
export function useChatMembers(conversationId: string | null) {
  return useQuery({
    queryKey: membersKey(conversationId),
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<ChatMember[]> => {
      const { data, error } = await supabase.rpc('list_chat_members' as never, { p_conv: conversationId } as never);
      if (error) throw error;
      return (data ?? []) as ChatMember[];
    },
  });
}

/** Nursery directory for picking chat recipients. Pass a nurseryId so chain/xo
 *  super admins (no home nursery) get the people of the selected nursery. */
export function useChatDirectory(search: string, nurseryId?: string | null) {
  return useQuery({
    queryKey: ['admin-chat-directory', search, nurseryId ?? null],
    queryFn: async (): Promise<ChatDirectoryEntry[]> => {
      const { data, error } = await supabase.rpc('chat_directory' as never, {
        search: search.trim() || null,
        p_nursery_id: nurseryId ?? null,
      } as never);
      if (error) throw error;
      return (data ?? []) as ChatDirectoryEntry[];
    },
    staleTime: 30 * 1000,
  });
}

/** All write actions for the admin chat page. */
export function useChatActions(userId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: conversationsKey(userId) });
  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-chat-members'] });

  const createConversation = useMutation({
    mutationFn: async (args: { kind: 'direct' | 'group'; title?: string | null; memberIds: string[] }) => {
      const { data, error } = await supabase.rpc('create_chat_conversation' as never, {
        p_kind: args.kind,
        p_title: args.title ?? null,
        p_member_ids: args.memberIds,
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidateList,
  });

  const sendMessage = useMutation({
    mutationFn: async (args: { conversationId: string; content: string }) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase
        .from('chat_messages')
        .insert({ conversation_id: args.conversationId, sender_id: userId, content: args.content } as never);
      if (error) throw error;
    },
  });

  const markRead = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userId) return;
      await supabase
        .from('chat_conversation_members')
        .update({ last_read_at: new Date().toISOString() } as never)
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
    },
    onSuccess: invalidateList,
  });

  const setReadOnly = useMutation({
    mutationFn: async (args: { conversationId: string; value: boolean }) => {
      const { error } = await supabase
        .from('chat_conversations')
        .update({ is_read_only: args.value } as never)
        .eq('id', args.conversationId);
      if (error) throw error;
    },
    onSuccess: invalidateList,
  });

  const setMemberCanWrite = useMutation({
    mutationFn: async (args: { conversationId: string; memberId: string; value: boolean }) => {
      const { error } = await supabase
        .from('chat_conversation_members')
        .update({ can_write: args.value } as never)
        .eq('conversation_id', args.conversationId)
        .eq('user_id', args.memberId);
      if (error) throw error;
    },
    onSuccess: invalidateMembers,
  });

  const addMembers = useMutation({
    mutationFn: async (args: { conversationId: string; memberIds: string[] }) => {
      const rows = args.memberIds.map((id) => ({ conversation_id: args.conversationId, user_id: id }));
      const { error } = await supabase
        .from('chat_conversation_members')
        .upsert(rows as never, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMembers();
      invalidateList();
    },
  });

  const moderateMessage = useMutation({
    mutationFn: async (args: { messageId: string; kind: 'removed' | 'disabled' | null }) => {
      const patch = args.kind
        ? { moderation: args.kind, moderated_by: userId, moderated_at: new Date().toISOString() }
        : { moderation: null, moderated_by: null, moderated_at: null };
      const { error } = await supabase
        .from('chat_messages')
        .update(patch as never)
        .eq('id', args.messageId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-chat-thread'] }),
  });

  const removeMember = useMutation({
    mutationFn: async (args: { conversationId: string; memberId: string }) => {
      const { error } = await supabase
        .from('chat_conversation_members')
        .delete()
        .eq('conversation_id', args.conversationId)
        .eq('user_id', args.memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateMembers();
      invalidateList();
    },
  });

  const hideConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from('chat_conversation_members')
        .update({ is_hidden: true } as never)
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: invalidateList,
  });

  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.from('chat_conversations').delete().eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: invalidateList,
  });

  return {
    createConversation,
    sendMessage,
    markRead,
    setReadOnly,
    setMemberCanWrite,
    moderateMessage,
    addMembers,
    removeMember,
    hideConversation,
    deleteConversation,
  };
}
