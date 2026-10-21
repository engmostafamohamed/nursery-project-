// The child's QR card (admin "Photo & QR" tab and the parent's QR pages) and the admin photo
// panel next to it: every text they show exists in English and Arabic.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../components/qr/ChildQrCodeCard.tsx',
  '../components/qr/CopyQrLinkButton.tsx',
  '../components/admin/ChildAvatarUpload.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('child QR card', () => {
  it.each(files)('every key %s uses exists in English and Arabic', (file) => {
    const code = readFileSync(path.resolve(__dirname, file), 'utf8');
    const keys = [...new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.flatMap((key) => [
      ...(typeof lookup(en, key) === 'string' ? [] : [`en: ${key}`]),
      ...(typeof lookup(ar, key) === 'string' ? [] : [`ar: ${key}`]),
    ]);
    expect(missing).toEqual([]);
  });
});
