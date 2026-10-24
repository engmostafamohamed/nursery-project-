import { useSessionProfile } from '@/hooks/useSessionProfile';
import type { UserRole } from '@/types/user';

export type RouteGuardStatus = 'loading' | 'unauthenticated' | 'database' | 'forbidden' | 'ok';

export function useRouteGuard(allowedRoles: UserRole[]): RouteGuardStatus {
  const { status, profile } = useSessionProfile();
  if (status !== 'ready') return status;
  return allowedRoles.includes(profile.role) ? 'ok' : 'forbidden';
}
