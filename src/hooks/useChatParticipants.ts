import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { ChatParticipant, ChatParticipantRole, ChatRole } from '@/types/chat';

type DirectoryRow = {
  id: string;
  name_ar: string;
  name_en: string;
  role: ChatParticipantRole;
};

/**
 * Resolves the set of users the current viewer is allowed to message, via the
 * `chat_directory` SECURITY DEFINER RPC. The RPC is nursery-scoped and applies
 * the visibility rule (parents see staff only; staff/admins see everyone),
 * which the row-level users SELECT policy cannot express for non-admins.
 *
 * `role` is retained for cache-key stability across role-specific layouts; the
 * RPC derives identity and scope from the authenticated session.
 */
export function useChatParticipants(
  role: ChatRole,
  userId: string | undefined,
  nurseryId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['chat-participants', role, userId, nurseryId],
    queryFn: async (): Promise<ChatParticipant[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc('chat_directory' as never, {
        search: null,
      } as never);
      if (error) throw error;
      return ((data ?? []) as DirectoryRow[]).map((row) => ({
        id: row.id,
        name_ar: row.name_ar,
        name_en: row.name_en,
        role: row.role,
        nursery_id: nurseryId ?? null,
        class_role: null,
      }));
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 30,
  });
}
