import type { ReactNode } from 'react';

import { useFeatureAccess } from '@/hooks/usePermissions';
import type { FeatureKey } from '@/lib/permissions';

interface PermissionGateProps {
  /** Feature/row from the permission matrix. */
  feature: FeatureKey;
  /** Rendered when the user lacks access. Defaults to nothing. */
  fallback?: ReactNode;
  /**
   * Render-prop form, useful when you need the "with approval" flag:
   *   <PermissionGate feature="daily_reports">
   *     {({ requiresApproval }) => <ReportForm needsApproval={requiresApproval} />}
   *   </PermissionGate>
   */
  children: ReactNode | ((access: { requiresApproval: boolean }) => ReactNode);
}

/**
 * Conditionally renders children based on the current user's feature access.
 * Drives both navigation visibility and in-page section gating.
 */
export function PermissionGate({ feature, fallback = null, children }: PermissionGateProps) {
  const { allowed, requiresApproval } = useFeatureAccess(feature);

  if (!allowed) {
    return <>{fallback}</>;
  }

  if (typeof children === 'function') {
    return <>{children({ requiresApproval })}</>;
  }

  return <>{children}</>;
}
