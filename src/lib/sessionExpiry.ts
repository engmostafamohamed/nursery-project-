import { isAuthSessionError } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';

/**
 * Ends a session that the server has stopped honouring, from anywhere in the app.
 *
 * The route guard only sees the profile query. Any other request can be the one that
 * discovers the token is dead, and left alone it surfaces as a local error toast on a
 * page the user can no longer actually use.
 */
const EXPIRED_FLAG = 'xo:session-expired';

/** Signing out is async and several failures usually land at once. */
let recoveryInFlight: Promise<'ignored' | 'refreshed' | 'signed-out'> | null = null;

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

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;

  const from = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({ sessionExpired: true, from }, '', '/login');
  window.dispatchEvent(new PopStateEvent('popstate', { state: { sessionExpired: true, from } }));
}

async function safeSignOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // The refresh token may already be invalid. Local redirect still matters.
  }
}

export function handleFailedRequest(error: unknown): Promise<'ignored' | 'refreshed' | 'signed-out'> {
  if (!isAuthSessionError(error)) return Promise.resolve('ignored');
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = supabase.auth
    .refreshSession()
    .then(async ({ data, error: refreshError }) => {
      if (!refreshError && data.session) {
        return 'refreshed' as const;
      }

      rememberExpiry();
      await safeSignOut();
      redirectToLogin();
      return 'signed-out' as const;
    })
    .catch(async () => {
      rememberExpiry();
      await safeSignOut();
      redirectToLogin();
      return 'signed-out' as const;
    })
    .finally(() => {
      recoveryInFlight = null;
    });

  return recoveryInFlight;
}
