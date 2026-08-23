import type { UserRole } from '@/types/user';

import { PERMISSION_MATRIX } from './matrix';
import type {
  AccessDecision,
  FeatureKey,
  PermissionSubject,
  RoleColumn,
} from './types';

const DENIED: AccessDecision = { allowed: false, requiresApproval: false };

/** Maps a stored {@link UserRole} to its spreadsheet column. */
export function roleColumn(role: UserRole): RoleColumn {
  switch (role) {
    case 'xo_super_admin':
      return 'super';
    case 'chain_super_admin':
    case 'branch_admin':
      return 'topManagement';
    case 'manager':
      return 'manager';
    case 'teacher':
      return 'teacher';
    case 'parent':
    default:
      return 'none';
  }
}

/**
 * Resolve how a user may access a feature.
 * This is the one function every check ultimately goes through.
 */
export function evaluate(subject: PermissionSubject, feature: FeatureKey): AccessDecision {
  const column = roleColumn(subject.role);

  // xo_super_admin: unrestricted.
  if (column === 'super') {
    return { allowed: true, requiresApproval: false };
  }

  // Roles not represented in the matrix (e.g. parent) get nothing here.
  if (column === 'none') {
    return DENIED;
  }

  const access = PERMISSION_MATRIX[feature][column];

  if (access === 'none') {
    return DENIED;
  }

  if (access === 'full') {
    return { allowed: true, requiresApproval: false };
  }

  if (access === 'with_approval') {
    return { allowed: true, requiresApproval: true };
  }

  // Department-gated cell ("Finance" / "HR"): allowed only for matching department.
  const allowed = subject.department === access.requireDepartment;
  return { allowed, requiresApproval: false };
}

/** Convenience boolean: does the subject have any access to the feature? */
export function can(subject: PermissionSubject, feature: FeatureKey): boolean {
  return evaluate(subject, feature).allowed;
}

/** True when the subject has access but their actions require approval. */
export function requiresApproval(subject: PermissionSubject, feature: FeatureKey): boolean {
  return evaluate(subject, feature).requiresApproval;
}

/** Returns the subset of features the subject can access (handy for menus/debug). */
export function allowedFeatures(subject: PermissionSubject): FeatureKey[] {
  return (Object.keys(PERMISSION_MATRIX) as FeatureKey[]).filter((feature) =>
    can(subject, feature),
  );
}
