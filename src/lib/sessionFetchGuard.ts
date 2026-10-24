/**
 * Keeps a signed-in user's request from going out as an anonymous one.
 *
 * When supabase-js cannot refresh an expired access token (the network is not back yet after
 * sleep, or the auth server is busy), it sends the request with the public key instead. Row-level
 * security then hides the user's rows, so the request "succeeds" with nothing: pages look empty,
 * and the route guard reads the missing profile as a database failure and shows /error.
 *
 * Answering 401 instead turns it into what it is, an expired session, which the app already
 * recovers from: refresh the token, or sign out and go back to sign-in (see sessionExpiry.ts).
 */

/** Error code of the 401 answered in place of the anonymous request. `isAuthSessionError` knows it. */
export const SESSION_EXPIRED_CODE = 'session_expired';

/**
 * True for the error of a request this guard stopped. supabase-js had already retried the
 * refresh for ~30s by then, so retrying the request or refreshing again only keeps the user waiting.
 */
export function isRefreshFailure(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === SESSION_EXPIRED_CODE;
}

type ReadableStorage = Pick<Storage, 'getItem'>;

/** True when supabase-js has a user session stored under `storageKey`, usable or not. */
export function hasStoredSession(storage: ReadableStorage | undefined, storageKey: string): boolean {
  try {
    const raw = storage?.getItem(storageKey);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { refresh_token?: unknown } | null;
    return typeof stored?.refresh_token === 'string' && stored.refresh_token.length > 0;
  } catch {
    // Blocked storage or a corrupt value: supabase-js cannot use it either.
    return false;
  }
}

/**
 * True for a request that should carry the user's token but carries the public key.
 * Sign-in, token refresh and sign-out requests always carry the public key, so they pass.
 */
export function isAnonymousFallback(
  url: string,
  authorization: string | null,
  anonKey: string,
  sessionStored: boolean,
): boolean {
  if (!sessionStored || authorization !== `Bearer ${anonKey}`) return false;
  return !new URL(url).pathname.startsWith('/auth/v1/');
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function requestHeaders(input: RequestInfo | URL, init: RequestInit | undefined): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

export function createSessionGuardedFetch(options: {
  anonKey: string;
  storageKey: string;
  storage: ReadableStorage | undefined;
  baseFetch?: typeof fetch;
}): typeof fetch {
  const { anonKey, storageKey, storage } = options;
  const baseFetch = options.baseFetch ?? ((input, init) => globalThis.fetch(input, init));

  return async (input, init) => {
    const authorization = requestHeaders(input, init).get('Authorization');
    if (isAnonymousFallback(requestUrl(input), authorization, anonKey, hasStoredSession(storage, storageKey))) {
      return new Response(
        JSON.stringify({
          code: SESSION_EXPIRED_CODE,
          message: 'Session expired: the access token could not be refreshed.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return baseFetch(input, init);
  };
}
