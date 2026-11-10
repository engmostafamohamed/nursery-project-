/*
 * The server's functions refuse with a short code in the error message (menu_forbidden,
 * kitchen_not_enough, ...). These find which known code a caught error carries and the text that
 * explains it, so each feature only lists its codes and where their texts live.
 */

/** The message of anything thrown: an Error, a Supabase error object, or a plain value. */
export function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error ?? '');
}

/**
 * The known code the error's message names, else null. The longest code is tried first, so a code
 * inside a longer one (menu_invalid_dish in menu_invalid_dishes) does not win by mistake.
 */
export function errorCodeIn<T extends string>(error: unknown, codes: readonly T[]): T | null {
  const message = errorMessage(error);
  return [...codes].sort((a, b) => b.length - a.length).find((code) => message.includes(code)) ?? null;
}

/** A request that never reached the server (offline, blocked, dropped). */
export const isNetworkError = (error: unknown): boolean => /failed to fetch|network|load failed/i.test(errorMessage(error));

/**
 * The text key for a failed call under `base`: `<base>.<code>` for a known code (without
 * `stripPrefix` when the texts are named without it), `<base>.network` when the request did not
 * get through, else `<base>.failed`.
 */
export function errorTextKey(error: unknown, codes: readonly string[], base: string, stripPrefix = ''): string {
  const code = errorCodeIn(error, codes);
  if (code) return `${base}.${stripPrefix && code.startsWith(stripPrefix) ? code.slice(stripPrefix.length) : code}`;
  return `${base}.${isNetworkError(error) ? 'network' : 'failed'}`;
}
