// Messages from the nursery's staff to families: who sent one (name, role, the title the nursery gave
// them, department, classes and place in them) as parents see it, and the server's refusals.
import type { FamilyAudience } from './teacherClasses';

export type StaffRole = 'xo_super_admin' | 'chain_super_admin' | 'branch_admin' | 'manager' | 'teacher' | 'parent';
export type StaffDepartment = 'finance' | 'hr' | 'operations';
export type ClassPlace = 'lead' | 'assistant' | 'substitute';

/** A message as a parent reads it (get_parent_family_messages). */
export type ParentFamilyMessage = {
  message_id: string;
  created_at: string;
  body: string;
  audience: FamilyAudience;
  sender_name_ar: string | null;
  sender_name_en: string | null;
  sender_role: StaffRole;
  sender_role_title_ar: string | null;
  sender_role_title_en: string | null;
  sender_department: StaffDepartment | null;
  sender_class_names_ar: string | null;
  sender_class_names_en: string | null;
  sender_class_role: ClassPlace | null;
  children_ar: string | null;
  children_en: string | null;
  read_at: string | null;
};

/** A message as its sender sees it (get_sent_family_messages). */
export type SentFamilyMessage = {
  message_id: string;
  created_at: string;
  body: string;
  audience: FamilyAudience;
  sender_class_names_ar: string | null;
  sender_class_names_en: string | null;
  children_count: number;
  parents_count: number;
  read_count: number;
  children_ar: string | null;
  children_en: string | null;
};

const pick = (ar: string | null | undefined, en: string | null | undefined, lang: string) =>
  (lang.startsWith('ar') ? ar?.trim() || en?.trim() : en?.trim() || ar?.trim()) || null;

/** Who sent a message, in the reader's language: the parts a parent sees under the sender's name. */
export type SenderParts = {
  name: string | null;
  role: StaffRole;
  /** The title the nursery gave the sender ("Head of teachers"), when it says more than the role. */
  title: string | null;
  department: StaffDepartment | null;
  classes: string | null;
  place: ClassPlace | null;
};

export function senderParts(message: ParentFamilyMessage, lang: string): SenderParts {
  return {
    name: pick(message.sender_name_ar, message.sender_name_en, lang),
    role: message.sender_role,
    title: pick(message.sender_role_title_ar, message.sender_role_title_en, lang),
    department: message.sender_department,
    classes: pick(message.sender_class_names_ar, message.sender_class_names_en, lang),
    place: message.sender_class_role,
  };
}

export function childrenOf(message: { children_ar: string | null; children_en: string | null }, lang: string): string {
  return pick(message.children_ar, message.children_en, lang) ?? '';
}

export const FAMILY_MESSAGE_MAX = 2000;

/** The server's refusal as a locale key under familyMessages.errors (unknown ones fall back to `failed`). */
export function familyMessageErrorKey(error: unknown): string {
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  const known = [
    'family_message_child_not_in_your_class',
    'family_message_body_invalid',
    'family_message_no_children',
    'family_message_no_parents',
    'family_message_forbidden',
    'family_message_child_not_found',
    'chat_member_not_allowed',
  ];
  const hit = known.find((code) => message.includes(code));
  return hit ? hit.replace('family_message_', '') : 'failed';
}
