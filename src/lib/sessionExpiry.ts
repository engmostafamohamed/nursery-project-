import { clearCachedApiResponses } from '@/lib/apiResponseCache';
import { isAuthSessionError } from '@/lib/authErrors';
import { isRefreshFailure } from '@/lib/sessionFetchGuard';
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase';

/**
 * Ends a session that the server has stopped honouring, from anywhere in the app.
 *
 * The route guard only sees the profile query. Any other request can be the one that
 * discovers the token is dead, and left alone it surfaces as a local error toast on a
 * page the user can no longer actually use.
 *
 * Ending the session is enough to get the user back to sign-in: supabase-js announces
 * SIGNED_OUT, the session in AuthProvider becomes null, and every protected route
 * redirects to /login with the page to come back to.
 */
const EXPIRED_FLAG = 'xo:session-expired';

/** Signing out is async and several failures usually land at once. */
let recoveryInFlight: Promise<'ignored' | 'refreshed' | 'signed-out'> | null = null;

/** Set while the user's own sign-out runs, so its SIGNED_OUT is not taken for an expiry. */
let userSignOutInProgress = false;

/** Told the moment a session ends, before supabase-js confirms it (see endSession). */
const sessionEndedListeners = new Set<() => void>();

export function subscribeSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

function rememberExpiry(): void {
  try {
    window.sessionStorage.setItem(EXPIRED_FLAG, '1');
  } catch {
    // Private mode or blocked storage — the redirect still happens, just unexplained.
  }
}

/** True once, for the sign-in screen to explain why the user is looking at it. */
export function consumeSessionExpiredFlag(): boolean {
  try {
    if (window.sessionStorage.getItem(EXPIRED_FLAG) !== '1') return false;
    window.sessionStorage.removeItem(EXPIRED_FLAG);
    return true;
  } catch {
    return false;
  }
}

export function hasSessionExpiredFlag(): boolean {
  try {
    return window.sessionStorage.getItem(EXPIRED_FLAG) === '1';
  } catch {
    return false;
  }
}

/**
 * AuthProvider calls this on every SIGNED_OUT, whatever caused it: the sign-out button,
 * endSession, or supabase-js itself dropping a refused refresh token (revoked, already used).
 */
export async function onSignedOut(hadSession: boolean): Promise<void> {
  // A session that ends without the user signing out has expired: say so on the sign-in page.
  if (hadSession && !userSignOutInProgress) rememberExpiry();
  await clearCachedApiResponses();
}

function dropStoredSession(): void {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Blocked storage holds no session either.
  }
}

/** Revokes the session on the server too. False when supabase-js could not load the session. */
async function signOutEverywhere(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut();
    return !error;
  } catch {
    return false;
  }
}

/**
 * Ends the session on this device only, whatever state its token is in.
 *
 * supabase-js will not sign out a session whose token it cannot refresh: signOut() answers
 * with that refresh error and keeps the session. Dropping the stored session first lets the
 * local sign-out go through and announce SIGNED_OUT.
 */
async function signOutHere(): Promise<void> {
  dropStoredSession();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The stored session is already gone; nothing else to undo.
  }
}

/**
 * Signs out, and makes sure the session is gone even when the server cannot be reached.
 * Before this, a token that could not be refreshed left the user signed in on a page that
 * could no longer load anything, and the sign-out button answering "Could not sign out".
 */
export async function endSession(reason: 'user' | 'expired'): Promise<void> {
  if (reason === 'expired') rememberExpiry();
  userSignOutInProgress = reason === 'user';
  // Leave every screen now, and take the user's cached data with them. While supabase-js is
  // still retrying a refresh it holds its lock, and its sign-out (and SIGNED_OUT, which clears
  // the cache again) waits behind it for up to ~30s.
  sessionEndedListeners.forEach((listener) => listener());
  const clearingCache = clearCachedApiResponses();
  try {
    // An expired session cannot be revoked on the server (that needs a working token), and
    // asking supabase-js to try makes it retry the refresh for another ~30s first.
    const revoked = reason === 'user' && (await signOutEverywhere());
    if (!revoked) await signOutHere();
  } finally {
    userSignOutInProgress = false;
  }
  await clearingCache;
}

export function handleFailedRequest(error: unknown): Promise<'ignored' | 'refreshed' | 'signed-out'> {
  if (!isAuthSessionError(error)) return Promise.resolve('ignored');
  if (recoveryInFlight) return recoveryInFlight;

  const signOut = async () => {
    await endSession('expired');
    return 'signed-out' as const;
  };

  // A token the server refused (PGRST301, 401) may only need refreshing; one supabase-js could
  // not refresh already failed that.
  const recovery = isRefreshFailure(error)
    ? signOut()
    : supabase.auth
        .refreshSession()
        .then(({ data, error: refreshError }) => {
          if (!refreshError && data.session) {
            return 'refreshed' as const;
          }
          return signOut();
        })
        .catch(signOut);

  recoveryInFlight = recovery.finally(() => {
    recoveryInFlight = null;
  });

  return recoveryInFlight;
}
