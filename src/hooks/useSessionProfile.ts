import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { isAuthSessionError } from '@/lib/authErrors';
import { handleFailedRequest } from '@/lib/sessionExpiry';
import { resolveSessionState, type SessionState } from '@/lib/sessionStatus';
import type { UserRow } from '@/types/user';

/** The signed-in user's profile, or why there is none yet (see resolveSessionState). */
export function useSessionProfile(): SessionState<UserRow> {
  const { session, loading: sessionLoading } = useAuthSession();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();
  const { data: profile, isPending, isError, error } = useUserProfile(userId);

  // An access token can die while a session object is still held in memory, so the
  // profile request comes back 401 rather than the session simply disappearing.
  // Refresh it, or end it, which drops every guard into 'unauthenticated' and back to sign-in.
  const sessionExpired = isError && isAuthSessionError(error);
  useEffect(() => {
    if (sessionExpired) {
      void handleFailedRequest(error).then((result) => {
        if (result === 'refreshed' && userId) {
          void queryClient.invalidateQueries({ queryKey: ['user-profile', userId] });
        }
      });
    }
  }, [sessionExpired, error, queryClient, userId]);

  return resolveSessionState({
    sessionLoading,
    hasSession: Boolean(session),
    profilePending: isPending,
    profileError: isError ? error : null,
    profile,
  });
}
