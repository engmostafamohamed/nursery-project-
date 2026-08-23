/**
 * Tells an expired/invalid session apart from a genuine backend failure.
 *
 * PostgREST answers a request carrying a dead JWT with 401 and code PGRST301,
 * which otherwise looks like any other query error — and a route guard that
 * cannot tell them apart sends an expired user to the database-error page
 * instead of back to sign-in.
 */
const AUTH_ERROR_CODES = new Set(['PGRST301', '401', 'invalid_token', 'bad_jwt', 'session_expired']);

const AUTH_ERROR_PATTERN = /\b(jwt (expired|is invalid|malformed)|invalid (jwt|token|claim)|token (is )?expired|refresh token|not authenticated|unauthorized)\b/i;

export function isAuthSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

  if (typeof candidate.code === 'string' && AUTH_ERROR_CODES.has(candidate.code)) return true;
  if (candidate.status === 401) return true;
  if (candidate.name === 'AuthSessionMissingError' || candidate.name === 'AuthApiError') return true;
  if (typeof candidate.message === 'string' && AUTH_ERROR_PATTERN.test(candidate.message)) return true;

  return false;
}
