import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Action, FeatureKey } from '@/lib/permissions/types';

export interface PermissionMatrixEntry {
  actions: ReadonlySet<Action>;
  requiresApproval: boolean;
}

export type PermissionMatrixMap = Map<FeatureKey, PermissionMatrixEntry>;

interface PermissionMatrixRow {
  feature_id: string;
  actions: Action[];
  requires_approval: boolean;
}

/**
 * Fetches the DB-driven feature access map for a given role_id.
 *
 * Phase 0 seeded role_features so the DB mirrors src/lib/permissions/matrix.ts
 * exactly. Phase 5 added per-action granularity — the hook now returns the set
 * of CRUD actions each feature unlocks. Backwards compat: a feature being
 * present in the map (with 'view' in actions) is equivalent to the old
 * `access === 'full' || 'with_approval'` check.
 *
 * xo_super_admin should short-circuit before calling this hook.
 */
export function usePermissionMatrix(roleId: string | null | undefined) {
  return useQuery<PermissionMatrixMap>({
    queryKey: ['permission-matrix', roleId],
    queryFn: async (): Promise<PermissionMatrixMap> => {
      const { data, error } = await supabase
        .from('role_features')
        .select('feature_id, actions, requires_approval')
        .eq('role_id', roleId as string);
      if (error) throw error;
      const map = new Map<FeatureKey, PermissionMatrixEntry>();
      for (const row of (data ?? []) as PermissionMatrixRow[]) {
        map.set(row.feature_id as FeatureKey, {
          actions: new Set<Action>(row.actions ?? []),
          requiresApproval: Boolean(row.requires_approval),
        });
      }
      return map;
    },
    enabled: Boolean(roleId),
    staleTime: 1000 * 60 * 5,
  });
}
