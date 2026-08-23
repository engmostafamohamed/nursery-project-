import type { ReactNode } from 'react';

import { useCanAction } from '@/hooks/usePermissions';
import type { Action, FeatureKey } from '@/lib/permissions';

interface ActionGateProps {
  /** Feature/row from the permission matrix. */
  feature: FeatureKey;
  /** The CRUD action the children require — 'create' | 'update' | 'delete' | 'view'. */
  action: Action;
  /** Rendered when the user lacks the action. Defaults to nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally renders children based on whether the current user may perform
 * a specific CRUD action on a feature. Use it to hide Create / Edit / Delete /
 * Upload controls when the role's `role_features.actions` grant excludes them.
 *
 *   <ActionGate feature="classes" action="create">
 *     <Button>New class</Button>
 *   </ActionGate>
 *
 * Defence in depth only — RLS still enforces the real boundary in the DB.
 */
export function ActionGate({ feature, action, fallback = null, children }: ActionGateProps) {
  const allowed = useCanAction(feature, action);
  return <>{allowed ? children : fallback}</>;
}
