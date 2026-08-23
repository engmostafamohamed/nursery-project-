import { useEffect } from 'react';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { isAuthSessionError } from '@/lib/authErrors';
import { handleFailedRequest } from '@/lib/sessionExpiry';
import type { UserRole } from '@/types/user';

export type RouteGuardStatus =
  | 'loading'
  | 'unauthenticated'
  /** Was signed in, but the session died — worth telling the user, unlike a plain visit. */
  | 'expired'
  | 'database'
  | 'forbidden'
  | 'ok';

export function useRouteGuard(allowedRoles: UserRole[]): RouteGuardStatus {
  const { session, loading: sessionLoading } = useAuthSession();
  const userId = session?.user?.id;
  const { data: profile, isPending, isError, error } = useUserProfile(userId);

  // An access token can die while a session object is still held in memory, so the
  // profile request comes back 401 rather than the session simply disappearing.
  // Clear it, which drops every guard into 'unauthenticated' and back to sign-in.
  const sessionExpired = isError && isAuthSessionError(error);
  useEffect(() => {
    if (sessionExpired) {
      handleFailedRequest(error);
    }
  }, [sessionExpired, error]);

  if (sessionLoading) {
    return 'loading';
  }

  if (!session) {
    return 'unauthenticated';
  }

  // Checked before isPending so an expired token is never reported as loading.
  if (sessionExpired) {
    return 'expired';
  }

  if (isPending) {
    return 'loading';
  }

  if (isError || !profile) {
    return 'database';
  }

  if (!allowedRoles.includes(profile.role)) {
    return 'forbidden';
  }

  return 'ok';
}
