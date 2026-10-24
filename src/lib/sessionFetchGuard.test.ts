// An expired session must never turn into anonymous requests: with the public key, row-level
// security hides the user's rows, and the empty answer was read as a database failure (/error).
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAuthSessionError } from './authErrors';
import {
  SESSION_EXPIRED_CODE,
  createSessionGuardedFetch,
  hasStoredSession,
  isAnonymousFallback,
  isRefreshFailure,
} from './sessionFetchGuard';

const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const ANON_KEY = 'sb_publishable_test-key';
const STORAGE_KEY = 'xo-auth';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const storedSession = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    access_token: 'user-jwt',
    refresh_token: 'refresh-123',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
    ...overrides,
  });

describe('is a user session stored', () => {
  it.each([
    ['no storage', undefined, false],
    ['nothing stored', memoryStorage(), false],
    ['a corrupt value', memoryStorage({ [STORAGE_KEY]: '{not json' }), false],
    ['a session without a refresh token', memoryStorage({ [STORAGE_KEY]: storedSession({ refresh_token: '' }) }), false],
    ['a session', memoryStorage({ [STORAGE_KEY]: storedSession() }), true],
  ])('%s', (_label, storage, expected) => {
    expect(hasStoredSession(storage, STORAGE_KEY)).toBe(expected);
  });

  it('treats storage that throws as empty', () => {
    const blocked = { getItem: () => { throw new Error('SecurityError'); } };
    expect(hasStoredSession(blocked, STORAGE_KEY)).toBe(false);
  });
});

describe('which requests are an anonymous fallback', () => {
  const anon = `Bearer ${ANON_KEY}`;
  it.each([
    ['data read with the public key while signed in', `${SUPABASE_URL}/rest/v1/users?select=id`, anon, true, true],
    ['function call with the public key while signed in', `${SUPABASE_URL}/functions/v1/qr-token`, anon, true, true],
    ['file read with the public key while signed in', `${SUPABASE_URL}/storage/v1/object/x`, anon, true, true],
    ['data read with the user token', `${SUPABASE_URL}/rest/v1/users?select=id`, 'Bearer user-jwt', true, false],
    ['data read while signed out (public pages)', `${SUPABASE_URL}/rest/v1/nurseries?select=id`, anon, false, false],
    ['token refresh (always the public key)', `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, anon, true, false],
    ['sign-out (always the public key)', `${SUPABASE_URL}/auth/v1/logout?scope=global`, anon, true, false],
    ['request with no Authorization header', `${SUPABASE_URL}/rest/v1/users`, null, true, false],
  ])('%s', (_label, url, authorization, sessionStored, expected) => {
    expect(isAnonymousFallback(url, authorization, ANON_KEY, sessionStored)).toBe(expected);
  });
});

describe('the guarded fetch', () => {
  const ok = () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('answers 401 session_expired instead of sending the anonymous request', async () => {
    const baseFetch = vi.fn(async () => ok());
    const guarded = createSessionGuardedFetch({
      anonKey: ANON_KEY,
      storageKey: STORAGE_KEY,
      storage: memoryStorage({ [STORAGE_KEY]: storedSession() }),
      baseFetch,
    });

    const response = await guarded(`${SUPABASE_URL}/rest/v1/users?select=id`, {
      headers: new Headers({ Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY }),
    });

    expect(baseFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(SESSION_EXPIRED_CODE);
    // The app's recovery (refresh, else sign out) keys off this check.
    expect(isAuthSessionError(body)).toBe(true);
  });

  it('reads the Authorization header from a Request object too', async () => {
    const baseFetch = vi.fn(async () => ok());
    const guarded = createSessionGuardedFetch({
      anonKey: ANON_KEY,
      storageKey: STORAGE_KEY,
      storage: memoryStorage({ [STORAGE_KEY]: storedSession() }),
      baseFetch,
    });
    const request = new Request(`${SUPABASE_URL}/rest/v1/users`, { headers: { Authorization: `Bearer ${ANON_KEY}` } });

    expect((await guarded(request)).status).toBe(401);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it('sends every other request unchanged', async () => {
    const baseFetch = vi.fn(async () => ok());
    const guarded = createSessionGuardedFetch({
      anonKey: ANON_KEY,
      storageKey: STORAGE_KEY,
      storage: memoryStorage({ [STORAGE_KEY]: storedSession() }),
      baseFetch,
    });
    const init = { headers: { Authorization: 'Bearer user-jwt' } };

    const response = await guarded(`${SUPABASE_URL}/rest/v1/users?select=id`, init);

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledWith(`${SUPABASE_URL}/rest/v1/users?select=id`, init);
  });
});

describe('telling a failed refresh from other session errors', () => {
  // Not retried and not refreshed again (AppProviders, handleFailedRequest): straight to sign-in.
  it('is the error of a request the guard stopped', () => {
    expect(isRefreshFailure({ code: SESSION_EXPIRED_CODE, message: 'Session expired' })).toBe(true);
  });

  // A token the server refused may only need refreshing, so these still get the refresh attempt.
  it.each([[{ code: 'PGRST301', message: 'JWT expired' }], [{ status: 401 }], [null], [undefined], ['session_expired']])(
    '%o is not',
    (error) => {
      expect(isRefreshFailure(error)).toBe(false);
    },
  );
});

describe('with the real supabase-js client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A client whose stored access token has expired and whose refresh answers `refreshStatus`. */
  function clientWithExpiredToken(refreshStatus: number) {
    const storage = memoryStorage({ [STORAGE_KEY]: storedSession({ expires_at: Math.floor(Date.now() / 1000) - 60 }) });
    const sent: string[] = [];
    const baseFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      sent.push(new URL(url).pathname);
      if (url.includes('/auth/v1/token')) {
        return new Response(JSON.stringify({ code: 'unavailable', message: 'unavailable' }), { status: refreshStatus });
      }
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { storage, storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: createSessionGuardedFetch({ anonKey: ANON_KEY, storageKey: STORAGE_KEY, storage, baseFetch }) },
    });
    return { client, sent, storage };
  }

  it('turns a refresh the server could not answer into session_expired, not an empty profile', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    // 503 is "try again later": supabase-js keeps the session, retries, then falls back to the public key.
    const { client, sent, storage } = clientWithExpiredToken(503);

    // A query builder sends its request on every then(): turn it into a promise once.
    const pending = client.from('users').select('id, role').eq('id', 'user-1').maybeSingle().then((result) => result);
    // supabase-js retries the refresh for ~30s, at start-up and again for the request.
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    for (let step = 0; step < 40 && !settled; step += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
    }
    const { data, error } = await pending;

    expect(data).toBeNull();
    expect(error?.code).toBe(SESSION_EXPIRED_CODE);
    expect(isAuthSessionError(error)).toBe(true);
    expect(sent.filter((path) => path.startsWith('/rest/'))).toEqual([]);
    expect(sent.some((path) => path === '/auth/v1/token')).toBe(true);
    // supabase-js kept the session, which is why the request would otherwise have gone out anonymously.
    expect(hasStoredSession(storage, STORAGE_KEY)).toBe(true);
  });

  it('lets the request through once supabase-js has dropped a refused session', async () => {
    // 400 is a refused refresh token: supabase-js signs out itself, and the app goes to sign-in.
    const { client, sent, storage } = clientWithExpiredToken(400);

    const { error } = await client.from('nurseries').select('id').limit(1);

    expect(error).toBeNull();
    expect(hasStoredSession(storage, STORAGE_KEY)).toBe(false);
    expect(sent).toContain('/rest/v1/nurseries');
  });
});
