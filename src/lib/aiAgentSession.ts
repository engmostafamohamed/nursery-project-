import { supabase } from '@/lib/supabase';

/**
 * Reads Supabase session, refreshes when missing/expired,
 * then returns the access token for the AI Edge Function Authorization header.
 */
export async function resolveAccessTokenForAiEdgeFetch(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = sessionData.session?.expires_at ?? null;
  const expired = exp !== null && exp < nowSec;

  if (!sessionData.session || expired) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError || !refreshData.session) {
      throw new Error('Please sign out and sign in again');
    }

    return refreshData.session.access_token;
  }

  return sessionData.session.access_token;
}
