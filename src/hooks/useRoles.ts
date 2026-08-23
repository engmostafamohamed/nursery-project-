import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

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
  created_at: string;
  updated_at: string;
}

export function useRoles() {
  return useQuery<RoleRow[]>({
    queryKey: ['rbac', 'roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('is_seed', { ascending: false })
        .order('name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
    staleTime: 1000 * 60 * 2,
  });
}

export interface CreateRoleInput {
  key: string;
  name_en: string;
  name_ar: string;
  base_role: RoleRow['base_role'];
  base_department: RoleRow['base_department'];
  nursery_id: string | null;
  /** null = manage all; [] = none; [...] = specific keys */
  managed_position_keys?: string[] | null;
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRoleInput) => {
      const { data, error } = await supabase
        .from('roles')
        .insert({ ...input, is_seed: false })
        .select()
        .single();
      if (error) throw error;
      return data as RoleRow;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'roles'] });
    },
  });
}

export interface UpdateRoleInput {
  id: string;
  /** Pass undefined to leave the field unchanged. null clears it. */
  managed_position_keys?: string[] | null;
  name_en?: string;
  name_ar?: string;
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRoleInput) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from('roles').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'roles'] });
      // The viewer's profile-derived managed_position_keys is read via useStaff,
      // so invalidating staff queries refreshes the directory immediately.
      void qc.invalidateQueries({ queryKey: ['staff-profiles'] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'roles'] });
    },
  });
}

// -----------------------------------------------------------------------------
// role_features — fetch and update which features (and which actions) a role grants
// -----------------------------------------------------------------------------
export type RoleFeatureAction = 'view' | 'create' | 'update' | 'delete';

export interface RoleFeatureRow {
  role_id: string;
  feature_id: string;
  actions: RoleFeatureAction[];
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

export interface RoleFeatureGrant {
  feature_id: string;
  actions: RoleFeatureAction[];
  requires_approval: boolean;
}

/**
 * Replaces all role_features rows for a given role with the supplied grants.
 * Each grant must include 'view' in actions; rows whose actions array is empty
 * are dropped entirely (= no access).
 */
export function useSetRoleFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { roleId: string; grants: RoleFeatureGrant[] }) => {
      const { error: delErr } = await supabase
        .from('role_features')
        .delete()
        .eq('role_id', input.roleId);
      if (delErr) throw delErr;

      const rows = input.grants
        .filter((g) => g.actions.includes('view'))
        .map((g) => ({
          role_id: input.roleId,
          feature_id: g.feature_id,
          actions: g.actions,
          requires_approval: g.requires_approval,
          // Keep legacy `access` in sync so any code still reading it stays correct.
          access: g.requires_approval ? 'with_approval' : 'full',
        }));

      if (rows.length === 0) return;
      const { error: insErr } = await supabase.from('role_features').insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['rbac', 'role_features', vars.roleId] });
      void qc.invalidateQueries({ queryKey: ['permission-matrix'] });
    },
  });
}
