import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Action } from '@/lib/permissions/types';

export interface RoleRow {
  id: string;
  nursery_id: string | null;
  key: string;
  name_en: string;
  name_ar: string;
  base_role:
    | 'xo_super_admin'
    | 'chain_super_admin'
    | 'branch_admin'
    | 'manager'
    | 'teacher'
    | 'parent';
  base_department: 'finance' | 'hr' | 'operations' | null;
  /**
   * Position keys this role can manage. Drives:
   *   - which positions appear in the Staff Onboarding dropdown
   *   - which staff rows appear in /admin/staff for this viewer
   * Convention:
   *   NULL  -> manage all positions (no filter)
   *   []    -> manage none
   *   [...] -> manage only these positions
   */
  managed_position_keys: string[] | null;
  is_seed: boolean;
  /** The nursery's copy of a platform role (Operations / HR / Finance manager, Teacher). */
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

/** Staff roles are the ones a nursery manages; admin and parent roles are fixed. */
export type StaffBaseRole = 'manager' | 'teacher';
export type RoleDepartment = NonNullable<RoleRow['base_department']>;

/**
 * Roles of one scope: a nursery's own roles (`nurseryId`), or the platform templates new
 * nurseries copy (`nurseryId: null`, XO only).
 */
export function useRoles(scope: { nurseryId: string | null } = { nurseryId: null }) {
  const { nurseryId } = scope;
  return useQuery<RoleRow[]>({
    queryKey: ['rbac', 'roles', nurseryId],
    queryFn: async () => {
      let query = supabase.from('roles').select('*');
      query = nurseryId ? query.eq('nursery_id', nurseryId) : query.is('nursery_id', null);
      const { data, error } = await query
        .order('is_system', { ascending: false })
        .order('is_seed', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

// -----------------------------------------------------------------------------
// role_features — which modules (and which actions in each) a role grants
// -----------------------------------------------------------------------------
export interface RoleFeatureRow {
  role_id: string;
  feature_id: string;
  actions: Action[];
  requires_approval: boolean;
}

export function useRoleFeatures(roleId: string | null | undefined) {
  return useQuery<RoleFeatureRow[]>({
    queryKey: ['rbac', 'role_features', roleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_features')
        .select('role_id, feature_id, actions, requires_approval')
        .eq('role_id', roleId as string);
      if (error) throw error;
      return (data ?? []) as RoleFeatureRow[];
    },
    enabled: Boolean(roleId),
    staleTime: 1000 * 60 * 2,
  });
}

export interface RoleGrant {
  feature: string;
  actions: Action[];
  requires_approval: boolean;
}

export interface SaveRoleInput {
  /** null creates a new role. */
  roleId: string | null;
  /** The nursery a new role belongs to; null = platform template (XO only). */
  nurseryId: string | null;
  nameAr: string;
  nameEn: string;
  baseRole: StaffBaseRole;
  department: RoleDepartment | null;
  grants: RoleGrant[];
}

function invalidateRbac(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['rbac'] });
  void qc.invalidateQueries({ queryKey: ['permission-matrix'] });
  void qc.invalidateQueries({ queryKey: ['staff-profiles'] });
}

/**
 * Creates or updates a role and replaces its permissions in one server call
 * (public.rbac_save_role). The server keeps only the actions each module supports and
 * adds "view" when any other action is granted.
 */
export function useSaveRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveRoleInput) => {
      const { data, error } = await supabase.rpc('rbac_save_role' as never, {
        p_role_id: input.roleId,
        p_nursery_id: input.nurseryId,
        p_name_ar: input.nameAr,
        p_name_en: input.nameEn,
        p_base_role: input.baseRole,
        p_base_department: input.baseRole === 'manager' ? input.department : null,
        p_grants: input.grants,
      } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateRbac(qc),
  });
}

/** Deletes a custom role; the server refuses while anyone still has it. */
export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.rpc('rbac_delete_role' as never, { p_role_id: roleId } as never);
      if (error) throw error;
    },
    onSuccess: () => invalidateRbac(qc),
  });
}

// -----------------------------------------------------------------------------
// Who has which role
// -----------------------------------------------------------------------------
export interface StaffRoleRow {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  email: string | null;
  role: StaffBaseRole;
  role_id: string | null;
  status: string | null;
}

/** The nursery's managers and teachers with the role each one has. */
export function useNurseryStaffRoles(nurseryId: string | null) {
  return useQuery<StaffRoleRow[]>({
    queryKey: ['rbac', 'staff_roles', nurseryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name_ar, name_en, email, role, role_id, status')
        .eq('nursery_id', nurseryId as string)
        .in('role', ['manager', 'teacher'])
        .order('name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffRoleRow[];
    },
    enabled: Boolean(nurseryId),
    staleTime: 1000 * 60,
  });
}

/** Gives a staff member one of their nursery's roles (public.rbac_assign_user_role). */
export function useAssignUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; roleId: string }) => {
      const { error } = await supabase.rpc('rbac_assign_user_role' as never, {
        p_user_id: input.userId,
        p_role_id: input.roleId,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidateRbac(qc);
      void qc.invalidateQueries({ queryKey: ['user-profile', vars.userId] });
    },
  });
}

const RBAC_ERROR_CODES = [
  'rbac_role_not_found',
  'rbac_forbidden',
  'rbac_name_required',
  'rbac_invalid_base_role',
  'rbac_invalid_grants',
  'rbac_system_role_type_locked',
  'rbac_system_role_locked',
  'rbac_unknown_feature',
  'rbac_role_in_use',
  'rbac_cannot_change_own_role',
  'rbac_user_not_staff',
  'rbac_role_wrong_nursery',
  'rbac_user_not_found',
] as const;

/** Translation key for an error from the role functions. */
export function rbacErrorKey(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const code = RBAC_ERROR_CODES.find((known) => raw.includes(known));
  return code ? `rbac.errors.${code}` : 'rbac.errors.generic';
}
