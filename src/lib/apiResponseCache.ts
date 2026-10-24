/**
 * The service worker (public/sw.js, cache `xo-api-v<n>`) keeps copies of database answers so
 * pages still open offline. They belong to whoever was signed in, so they go when that session
 * ends: the next person on a shared device must not be shown them.
 */
const API_CACHE_PREFIX = 'xo-api-';

export async function clearCachedApiResponses(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(API_CACHE_PREFIX)).map((name) => caches.delete(name)));
  } catch {
    // Cache Storage is blocked (private mode, policy): nothing was stored in it.
  }
}
