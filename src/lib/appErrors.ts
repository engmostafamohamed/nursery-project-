/**
 * What the error screen needs to know about a crash.
 *
 * The usual one after a deploy: the page was loaded before it, and a screen opened now asks for a
 * code file the new version no longer has. Reloading once fixes it; reloading again and again
 * would not, so a second failure soon after shows the screen instead.
 */

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading (css )?chunk [\w-]+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];

/** A code file of the app could not be loaded (usually: a new version was deployed meanwhile). */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

const RELOAD_KEY = 'xo-chunk-reload-at';
/** A reload this recent that did not help means reloading again will not either. */
const RELOAD_WINDOW_MS = 30_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Whether to reload by itself for this error: a missing code file, and no such reload in the last
 * half minute. Records the reload when it says yes.
 */
export function shouldReloadForNewVersion(error: unknown, storage: StorageLike | null, now = Date.now()): boolean {
  if (!isChunkLoadError(error) || !storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** sessionStorage when this browser lets the page use it. */
export function sessionStorageOrNull(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
