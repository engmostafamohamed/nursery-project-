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
let signOutInFlight: Promise<void> | null = null;

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

export function handleFailedRequest(error: unknown): void {
  if (!isAuthSessionError(error)) return;
  if (signOutInFlight) return;

  rememberExpiry();
  // Clearing the session is what moves the user: every guard already sends a
  // sessionless visitor to sign-in.
  signOutInFlight = supabase.auth
    .signOut()
    .then(() => undefined)
    .finally(() => {
      signOutInFlight = null;
    });
}
