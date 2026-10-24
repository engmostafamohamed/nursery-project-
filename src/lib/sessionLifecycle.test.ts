// How a session ends: an expired one sends the user back to sign-in (never to /error), the
// sign-out button always works, and nothing of the user's is left behind on the device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb } from '@/test/fakeSupabase';

import {
  consumeSessionExpiredFlag,
  endSession,
  handleFailedRequest,
  hasSessionExpiredFlag,
  onSignedOut,
  subscribeSessionEnded,
} from './sessionExpiry';
import { resolveSessionState } from './sessionStatus';
import { toAppPath } from './utils';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('where a signed-in screen stands', () => {
  const profile = { id: 'user-1', role: 'parent' };
  const base = { sessionLoading: false, hasSession: true, profilePending: false, profileError: null, profile };

  it.each([
    ['session still loading', { sessionLoading: true }, 'loading'],
    ['no session', { hasSession: false, profile: undefined }, 'unauthenticated'],
    ['profile still loading', { profilePending: true, profile: undefined }, 'loading'],
    // The bug: an expired token is a sign-in problem. Wait for the refresh or the sign-out.
    ['profile read refused with an expired token', { profileError: { code: 'session_expired' }, profile: undefined }, 'loading'],
    ['profile read refused with an invalid JWT', { profileError: { code: 'PGRST301', message: 'JWT expired' }, profile: undefined }, 'loading'],
    ['profile read failed for another reason', { profileError: { code: '500', message: 'boom' }, profile: undefined }, 'database'],
    ['no profile row for this user', { profile: null }, 'database'],
    ['profile loaded', {}, 'ready'],
  ])('%s → %s', (_label, overrides, expected) => {
    expect(resolveSessionState({ ...base, ...overrides }).status).toBe(expected);
  });

  it('hands over the profile only when ready', () => {
    expect(resolveSessionState(base)).toEqual({ status: 'ready', profile });
    expect(resolveSessionState({ ...base, profile: null })).toEqual({ status: 'database', profile: null });
  });
});

describe('ending a session', () => {
  let localStorage: ReturnType<typeof memoryStorage>;
  let sessionStorage: ReturnType<typeof memoryStorage>;
  let deletedCaches: string[];

  beforeEach(() => {
    fakeDb.reset();
    localStorage = memoryStorage({ 'xo-auth': '{"refresh_token":"r"}', 'xo:theme': 'dark' });
    sessionStorage = memoryStorage();
    vi.stubGlobal('window', { localStorage, sessionStorage });
    deletedCaches = [];
    vi.stubGlobal('caches', {
      keys: async () => ['xo-api-v2', 'xo-static-v2'],
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tells the app at once, before supabase-js has finished signing out', async () => {
    let releaseSignOut: (value: { error: null }) => void = () => {};
    fakeDb.auth.signOut.mockImplementationOnce(() => new Promise((resolve) => (releaseSignOut = resolve)));
    const ended = vi.fn();
    const unsubscribe = subscribeSessionEnded(ended);

    const pending = endSession('user');
    expect(ended).toHaveBeenCalledOnce();
    // The user's cached data goes too, without waiting for the sign-out either.
    await vi.waitFor(() => expect(deletedCaches).toEqual(['xo-api-v2']));
    releaseSignOut({ error: null });
    await pending;
    unsubscribe();

    await endSession('user');
    expect(ended).toHaveBeenCalledOnce();
  });

  it('signs the user out on the server when it can', async () => {
    await endSession('user');

    expect(fakeDb.auth.signOut).toHaveBeenCalledOnce();
    expect(fakeDb.auth.signOut).toHaveBeenCalledWith();
    expect(hasSessionExpiredFlag()).toBe(false);
  });

  it('still signs out when supabase-js cannot load the session (token not refreshable)', async () => {
    fakeDb.auth.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });

    await endSession('user');

    // The stored session is dropped, then a local sign-out announces SIGNED_OUT.
    expect(localStorage.getItem('xo-auth')).toBeNull();
    expect(localStorage.getItem('xo:theme')).toBe('dark');
    expect(fakeDb.auth.signOut).toHaveBeenCalledTimes(2);
    expect(fakeDb.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  });

  it('still signs out when signOut throws', async () => {
    fakeDb.auth.signOut.mockRejectedValueOnce(new Error('offline'));

    await endSession('user');

    expect(localStorage.getItem('xo-auth')).toBeNull();
    expect(fakeDb.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
  });

  it("deletes the service worker's copies of database answers on any sign-out, and only those", async () => {
    await onSignedOut(false);

    expect(deletedCaches).toEqual(['xo-api-v2']);
  });

  it('tells the sign-in page, once, that the session expired', async () => {
    await endSession('expired');

    expect(hasSessionExpiredFlag()).toBe(true);
    expect(consumeSessionExpiredFlag()).toBe(true);
    expect(consumeSessionExpiredFlag()).toBe(false);
  });

  it('ends an expired session on this device straight away (no server sign-out to wait for)', async () => {
    await endSession('expired');

    expect(localStorage.getItem('xo-auth')).toBeNull();
    expect(fakeDb.auth.signOut).toHaveBeenCalledOnce();
    expect(fakeDb.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not take the user\'s own sign-out for an expiry', async () => {
    // AuthProvider calls onSignedOut on every SIGNED_OUT; supabase-js emits it inside signOut().
    fakeDb.auth.signOut.mockImplementationOnce(async () => {
      await onSignedOut(true);
      return { error: null };
    });

    await endSession('user');

    expect(hasSessionExpiredFlag()).toBe(false);
  });

  it('takes a SIGNED_OUT nobody asked for as an expiry (supabase-js dropped a refused session)', async () => {
    await onSignedOut(true);

    expect(hasSessionExpiredFlag()).toBe(true);
  });

  it('says nothing when there was no session to lose (opening the app signed out)', async () => {
    await onSignedOut(false);

    expect(hasSessionExpiredFlag()).toBe(false);
  });

  it('signs out at once when supabase-js has already failed to refresh the token', async () => {
    expect(await handleFailedRequest({ code: 'session_expired' })).toBe('signed-out');

    expect(fakeDb.auth.refreshSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('xo-auth')).toBeNull();
    expect(hasSessionExpiredFlag()).toBe(true);
  });

  it('first tries a refresh for a token the server refused', async () => {
    fakeDb.auth.refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'new' } }, error: null });

    expect(await handleFailedRequest({ code: 'PGRST301', message: 'JWT expired' })).toBe('refreshed');

    expect(fakeDb.auth.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem('xo-auth')).not.toBeNull();
    expect(hasSessionExpiredFlag()).toBe(false);
  });
});

describe('return-to paths used for a full page load', () => {
  it.each([
    ['/parent/children', '/parent/children'],
    ['/admin/invoices?status=overdue', '/admin/invoices?status=overdue'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example/x', '/'],
    ['javascript:alert(1)', '/'],
    ['', '/'],
    [null, '/'],
  ])('%s → %s', (path, expected) => {
    expect(toAppPath(path)).toBe(expected);
  });
});
