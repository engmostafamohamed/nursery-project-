import type { RoleDepartment, RoleRow, StaffBaseRole } from '@/hooks/useRoles';

/** The role "type": which app its people use (teacher app or admin dashboard) and their department. */
export type RoleType = 'teacher' | 'manager:operations' | 'manager:hr' | 'manager:finance';
export const ROLE_TYPES: readonly RoleType[] = ['teacher', 'manager:operations', 'manager:hr', 'manager:finance'];

export function roleTypeOf(role: Pick<RoleRow, 'base_role' | 'base_department'>): RoleType {
  if (role.base_role === 'manager') return `manager:${role.base_department ?? 'operations'}` as RoleType;
  return 'teacher';
}

export function splitRoleType(type: RoleType): { baseRole: StaffBaseRole; department: RoleDepartment | null } {
  if (type === 'teacher') return { baseRole: 'teacher', department: null };
  return { baseRole: 'manager', department: type.split(':')[1] as RoleDepartment };
}
