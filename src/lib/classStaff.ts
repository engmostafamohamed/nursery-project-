import type { ClassStaffRole } from '@/types/tables';

/** Order staff are listed in: the lead teacher, then the backup teacher, then assistants. */
const ROLE_ORDER: Record<ClassStaffRole, number> = { lead: 0, substitute: 1, assistant: 2 };

/** Translation key of the badge that names a teacher's role in a class. */
export function classStaffRoleKey(role: ClassStaffRole): string {
  if (role === 'lead') return 'teacher.classesHub.leadBadge';
  if (role === 'substitute') return 'teacher.classesHub.backupBadge';
  return 'teacher.classesHub.assistantBadge';
}

/** Badge style for a role: the lead stands out, the backup is outlined, assistants are muted. */
export function classStaffBadgeVariant(role: ClassStaffRole): 'default' | 'outline' | 'secondary' {
  if (role === 'lead') return 'default';
  if (role === 'substitute') return 'outline';
  return 'secondary';
}

export function compareClassStaffRoles(a: ClassStaffRole, b: ClassStaffRole): number {
  return ROLE_ORDER[a] - ROLE_ORDER[b];
}

export type ClassStaffGroups<P> = {
  lead: P | null;
  /** The backup teacher who covers when the lead is away. */
  substitute: P | null;
  assistants: P[];
};

/**
 * Splits a class's `class_staff` rows into its lead, backup and assistants, resolving each user
 * through `people`. Rows whose user cannot be resolved (for example, not visible to the viewer)
 * are left out.
 */
export function groupClassStaff<P>(
  members: ReadonlyArray<{ user_id: string; role: ClassStaffRole }>,
  people: ReadonlyMap<string, P>,
): ClassStaffGroups<P> {
  const find = (role: ClassStaffRole) => {
    const row = members.find((m) => m.role === role);
    return row ? (people.get(row.user_id) ?? null) : null;
  };
  return {
    lead: find('lead'),
    substitute: find('substitute'),
    assistants: members
      .filter((m) => m.role === 'assistant')
      .map((m) => people.get(m.user_id))
      .filter((p): p is P => p !== undefined),
  };
}
