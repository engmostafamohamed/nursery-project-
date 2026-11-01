// The error screen: telling a missing code file (a new version was deployed) from any other crash,
// and reloading by itself for it only once.
import { describe, expect, it } from 'vitest';

import { isChunkLoadError, shouldReloadForNewVersion } from '@/lib/appErrors';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

describe('isChunkLoadError', () => {
  it('knows each browser\'s words for a code file that could not be loaded', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Page-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/index-1.css'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' }))).toBe(true);
  });

  it('any other crash is not one', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Failed to fetch')).toBe(false);
  });
});

describe('shouldReloadForNewVersion', () => {
  const missingFile = new TypeError('Failed to fetch dynamically imported module');

  it('reloads once for a missing code file, not again within half a minute', () => {
    const storage = memoryStorage();
    expect(shouldReloadForNewVersion(missingFile, storage, 1_000_000)).toBe(true);
    expect(shouldReloadForNewVersion(missingFile, storage, 1_010_000)).toBe(false);
    expect(shouldReloadForNewVersion(missingFile, storage, 1_031_000)).toBe(true);
  });

  it('never for another crash, nor without storage to remember it', () => {
    expect(shouldReloadForNewVersion(new Error('boom'), memoryStorage())).toBe(false);
    expect(shouldReloadForNewVersion(missingFile, null)).toBe(false);
  });

  it('a storage that refuses is the same as none', () => {
    const refusing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(shouldReloadForNewVersion(missingFile, refusing)).toBe(false);
  });
});
