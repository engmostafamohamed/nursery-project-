import { useAuthContext } from '@/providers/AuthContext';

/**
 * Returns the shared auth session from AuthContext.
 * All callers share one Supabase subscription — no duplicate getSession() calls.
 */
export function useAuthSession() {
  return useAuthContext();
}
