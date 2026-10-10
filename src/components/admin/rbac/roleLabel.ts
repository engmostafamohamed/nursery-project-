import type { TFunction } from 'i18next';

import type { RoleRow } from '@/hooks/useRoles';

/**
 * A role's display name. The nursery's built-in roles use the locale label for their key;
 * roles an admin created show the names they typed.
 */
export function roleLabel(
 role: Pick<RoleRow, 'key' | 'name_ar' | 'name_en' | 'is_system' | 'is_seed'> | null, 
  language: string,
  t: TFunction,
): string {
  if (!role) return '';
  const typed = language === 'ar' ? role.name_ar?.trim() || role.name_en?.trim() : role.name_en?.trim() || role.name_ar?.trim();
  if (role.is_system || role.is_seed) return t(`rbac.systemRoles.${role.key}`, { defaultValue: typed || role.key });
  return typed || role.key;
}
