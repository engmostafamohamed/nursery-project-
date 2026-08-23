import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';

/**
 * Result of resolving the current viewer's "managed positions" scope.
 *
 *   keys === null  -> viewer can manage ALL positions (super_admin / chain_admin
 *                    / branch_admin / manager_operations and any other role
 *                    whose `roles.managed_position_keys` is NULL)
 *   keys === []    -> viewer can manage NO positions (teacher, parent, or any
 *                    role whose `managed_position_keys` is an empty array)
 *   keys === [...] -> viewer can manage exactly these position keys
 *
 * `isReady` is true once the user profile + role lookup have resolved. Callers
 * should hold off filtering until then to avoid a flash of empty data.
 */
export interface ViewerManagedPositions {
  keys: string[] | null;
  isReady: boolean;
}

/**
 * Reads `public.roles.managed_position_keys` for the signed-in user's role_id.
 *
 * - xo_super_admin always returns `keys: null` (sees everything) without a DB
 *   hit, matching the bypass pattern in usePermissionMatrix.
 * - Cached in React Query so the Staff Directory and Staff Onboarding form
 *   share a single network request.
 */
export function useViewerManagedPositions(): ViewerManagedPositions {
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const roleId = profile?.role_id ?? null;

  const query = useQuery<string[] | null>({
    queryKey: ['viewer-managed-positions', roleId],
    queryFn: async () => {
      if (!roleId) return null; // no custom role -> default to "manage all" (xo path covers this too)
      const { data, error } = await supabase
        .from('roles')
        .select('managed_position_keys')
        .eq('id', roleId)
        .maybeSingle();
      if (error) throw error;
      const row = data as { managed_position_keys: string[] | null } | null;
      return row?.managed_position_keys ?? null;
    },
    enabled: Boolean(roleId) && profile?.role !== 'xo_super_admin',
    staleTime: 1000 * 60 * 2,
  });

  // xo_super_admin short-circuit — never restricted by managed_position_keys.
  if (profile?.role === 'xo_super_admin') {
    return { keys: null, isReady: true };
  }

  return {
    keys: query.data ?? null,
    isReady: !profilePending && !query.isLoading,
  };
}
