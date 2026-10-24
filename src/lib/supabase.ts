import { createClient } from '@supabase/supabase-js';

import { createSessionGuardedFetch } from '@/lib/sessionFetchGuard';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and add your Supabase values.',
  );
}

/** Where supabase-js keeps the session in the browser. */
export const AUTH_STORAGE_KEY = 'xo-auth';

/** Browser localStorage only; omit on SSR so Supabase falls back to its default in-memory store. */
const browserStorage =
  typeof globalThis !== 'undefined' && 'localStorage' in globalThis
    ? globalThis.localStorage
    : undefined;

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    ...(browserStorage ? { storage: browserStorage } : {}),
  },
  global: {
    // A session whose token cannot be refreshed answers 401, never an anonymous request.
    fetch: createSessionGuardedFetch({ anonKey, storageKey: AUTH_STORAGE_KEY, storage: browserStorage }),
  },
});
