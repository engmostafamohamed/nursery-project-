import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { parentInAppNotificationsQueryKey } from '@/hooks/useParentInAppNotifications';
import type { ParentFamilyMessage, SentFamilyMessage } from '@/lib/familyMessages';
import { supabase } from '@/lib/supabase';
import type { FamilyAudience, MyClass, MyClassChild } from '@/lib/teacherClasses';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

/** The classes the signed-in teacher works in, with their place and the team (get_my_classes). */
export function useMyClasses(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-classes', userId],
    queryFn: async () => (await rpc<MyClass[] | null>('get_my_classes')) ?? [],
    enabled: Boolean(userId),
  });
}

/** Every child of the teacher's classes with today's state and parents; refreshed every minute. */
export function useMyClassChildren(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-class-children', userId],
    queryFn: async () => (await rpc<MyClassChild[] | null>('get_my_class_children')) ?? [],
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });
}

/** Sends a message to the families of the chosen children (send_family_message). */
export function useSendFamilyMessage(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { childIds: string[]; body: string; audience: FamilyAudience; classId: string | null }) =>
      rpc<{ message_id: string; parents: number; children: number }>('send_family_message', {
        p_child_ids: args.childIds,
        p_body: args.body,
        p_audience: args.audience,
        p_class_id: args.classId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sent-family-messages', userId] });
    },
  });
}

/** What the signed-in staff member sent, with how many families read it. */
export function useSentFamilyMessages(userId: string | undefined) {
  return useQuery({
    queryKey: ['sent-family-messages', userId],
    queryFn: async () => (await rpc<SentFamilyMessage[] | null>('get_sent_family_messages', { p_limit: 100 })) ?? [],
    enabled: Boolean(userId),
  });
}

/** The signed-in parent's messages from the staff, newest first. */
export function useParentFamilyMessages(userId: string | undefined) {
  return useQuery({
    queryKey: ['parent-family-messages', userId],
    queryFn: async () => (await rpc<ParentFamilyMessage[] | null>('get_parent_family_messages', { p_limit: 100 })) ?? [],
    enabled: Boolean(userId),
  });
}

export function useMarkFamilyMessageRead(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => rpc<number>('mark_family_message_read', { p_message_id: messageId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parent-family-messages', userId] });
      void qc.invalidateQueries({ queryKey: parentInAppNotificationsQueryKey(userId) });
    },
  });
}
