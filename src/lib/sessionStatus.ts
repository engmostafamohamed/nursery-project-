import { isAuthSessionError } from '@/lib/authErrors';

/**
 * Where a screen that needs the signed-in user stands, from the session and the profile read.
 * Shared by the route guard and the home redirect so both read a dead session the same way.
 */
export type SessionState<Profile> =
  | { status: 'ready'; profile: Profile }
  | { status: 'loading'; profile: null }
  | { status: 'unauthenticated'; profile: null }
  | { status: 'database'; profile: null };

export function resolveSessionState<Profile>(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  profilePending: boolean;
  /** The profile read's error, or null when it did not fail. */
  profileError: unknown;
  profile: Profile | null | undefined;
}): SessionState<Profile> {
  if (input.sessionLoading) return { status: 'loading', profile: null };
  if (!input.hasSession) return { status: 'unauthenticated', profile: null };

  // A dead token fails the profile read too. That is a sign-in problem, not a database one:
  // wait while the token is refreshed, or until the session ends and the check above sends
  // the user to sign-in.
  if (input.profileError && isAuthSessionError(input.profileError)) return { status: 'loading', profile: null };

  if (input.profilePending) return { status: 'loading', profile: null };
  if (input.profileError || !input.profile) return { status: 'database', profile: null };
  return { status: 'ready', profile: input.profile };
}
