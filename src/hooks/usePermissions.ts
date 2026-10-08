import { useMemo } from 'react';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePermissionMatrix } from '@/hooks/usePermissionMatrix';
import {
  allowedFeatures,
  evaluate,
  type AccessDecision,
  type Action,
  type FeatureActionDecision,
  type FeatureKey,
  type PermissionSubject,
} from '@/lib/permissions';
import { ALL_ACTIONS } from '@/lib/permissions/types';

const NO_ACCESS: AccessDecision = { allowed: false, requiresApproval: false };
const FULL_ACCESS: AccessDecision = { allowed: true, requiresApproval: false };
const WITH_APPROVAL: AccessDecision = { allowed: true, requiresApproval: true };

const ALL_ACTIONS_SET: ReadonlySet<Action> = new Set(ALL_ACTIONS);
const EMPTY_ACTIONS_SET: ReadonlySet<Action> = new Set();

const FULL_ACTION_DECISION: FeatureActionDecision = {
  allowed: true,
  requiresApproval: false,
  actions: ALL_ACTIONS_SET,
};
const NO_ACTION_DECISION: FeatureActionDecision = {
  allowed: false,
  requiresApproval: false,
  actions: EMPTY_ACTIONS_SET,
};
const WITH_APPROVAL_ACTION_DECISION: FeatureActionDecision = {
  allowed: true,
  requiresApproval: true,
  actions: ALL_ACTIONS_SET,
};

/**
 * Admin roles always have every permission — the same rule as public.user_can() on the server —
 * so a nursery admin editing roles can never lock themselves out.
 */
function hasEveryPermission(subject: PermissionSubject): boolean {
  return subject.role === 'xo_super_admin' || subject.role === 'chain_super_admin' || subject.role === 'branch_admin';
}

/**
 * Resolves the current signed-in user into a {@link PermissionSubject}.
 * Returns `null` while the profile is still loading.
 */
export function useCurrentSubject(): PermissionSubject | null {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);

  return useMemo<PermissionSubject | null>(() => {
    if (!profile) return null;
    return { role: profile.role, department: profile.department ?? null };
  }, [profile]);
}

/**
 * Full per-feature decision including the set of CRUD actions.
 *
 * Resolution order:
 *  1. Admin roles (xo / chain / branch admin) → full access, all actions, no approval needed.
 *  2. DB-driven matrix → look up role_features for the user's role_id.
 *  3. Static fallback → src/lib/permissions/matrix.ts. The static engine
 *     doesn't know about per-action grants; assume 'full' = all actions.
 */
export function useFeatureActions(feature: FeatureKey): FeatureActionDecision {
  const subject = useCurrentSubject();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const matrix = usePermissionMatrix(profile?.role_id ?? null);

  return useMemo(() => {
    if (!subject) return NO_ACTION_DECISION;
    if (hasEveryPermission(subject)) return FULL_ACTION_DECISION;

    if (matrix.data) {
      const entry = matrix.data.get(feature);
      if (!entry || !entry.actions.has('view')) return NO_ACTION_DECISION;
      return {
        allowed: true,
        requiresApproval: entry.requiresApproval,
        actions: entry.actions,
      };
    }

    // Static fallback — single-axis matrix.ts has no per-action info.
    const decision = evaluate(subject, feature);
    if (!decision.allowed) return NO_ACTION_DECISION;
    return decision.requiresApproval ? WITH_APPROVAL_ACTION_DECISION : FULL_ACTION_DECISION;
  }, [subject, feature, matrix.data]);
}

/**
 * Boolean shortcut: can the current user perform a specific action on a
 * specific feature? e.g. `useCanAction('staff', 'create')`.
 */
export function useCanAction(feature: FeatureKey, action: Action): boolean {
  const decision = useFeatureActions(feature);
  return decision.actions.has(action);
}

/**
 * Legacy boolean: can the current user access this feature at all?
 * Returns `true` if the user has at least 'view' on the feature.
 */
export function useFeatureAccess(feature: FeatureKey): AccessDecision {
  const decision = useFeatureActions(feature);
  if (!decision.allowed) return NO_ACCESS;
  return decision.requiresApproval ? WITH_APPROVAL : FULL_ACCESS;
}

/** Boolean shortcut: may the current user access this feature? */
export function useCan(feature: FeatureKey): boolean {
  return useFeatureAccess(feature).allowed;
}

/**
 * False while the user's grants are still loading, so screens can wait instead of briefly
 * showing "no access" (or a page the user may not see).
 */
export function usePermissionsReady(): boolean {
  const subject = useCurrentSubject();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const matrix = usePermissionMatrix(profile?.role_id ?? null);
  if (!subject) return false;
  if (hasEveryPermission(subject) || !profile?.role_id) return true;
  return !matrix.isPending;
}

/** All features the current user can access (e.g. to build a menu). */
export function useAllowedFeatures(): FeatureKey[] {
  const subject = useCurrentSubject();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const matrix = usePermissionMatrix(profile?.role_id ?? null);

  return useMemo(() => {
    if (!subject) return [];
    if (hasEveryPermission(subject)) {
      return allowedFeatures({ ...subject, role: 'xo_super_admin' });
    }
    if (matrix.data) {
      const list: FeatureKey[] = [];
      for (const [key, entry] of matrix.data.entries()) {
        if (entry.actions.has('view')) list.push(key);
      }
      return list;
    }
    return allowedFeatures(subject);
  }, [subject, matrix.data]);
}
