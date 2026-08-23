export type ChatRole = 'parent' | 'teacher' | 'admin';

export type ChatClassRole = 'lead' | 'assistant';

/**
 * Roles surfaced in the chat recipient directory. Sourced from the
 * `chat_directory` RPC, which returns every messageable role in the nursery
 * (parents see staff only; staff/admins see everyone).
 */
export type ChatParticipantRole =
  | 'parent'
  | 'teacher'
  | 'manager'
  | 'branch_admin'
  | 'chain_super_admin';

export interface ChatParticipant {
  id: string;
  name_ar: string;
  name_en: string;
  role: ChatParticipantRole;
  nursery_id: string | null;
  /**
   * For teacher participants, indicates whether this teacher acts as the
   * lead or as an assistant within the viewer's relevant classes. `null`
   * for parents and for teachers with no class assignment.
   */
  class_role?: ChatClassRole | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  read_at: string | null;
  created_at: string;
}
