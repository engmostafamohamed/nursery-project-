// The child's QR card (admin "Photo & QR" tab and the parent's QR pages), the admin photo
// panel next to it, and the parent's QR pages with their history list: every text they show
// exists in English and Arabic.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../components/qr/ChildQrCodeCard.tsx',
  '../components/qr/CopyQrLinkButton.tsx',
  '../components/admin/ChildAvatarUpload.tsx',
  '../components/qr/ParentQrHistoryList.tsx',
  '../pages/parent/ParentChildProfilePage.tsx',
  '../pages/parent/ParentQRCodePage.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('child QR card', () => {
  it.each(files)('every key %s uses exists in English and Arabic', (file) => {
    const code = readFileSync(path.resolve(__dirname, file), 'utf8');
    const keys = [...new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.flatMap((key) => {
      // A plural key lives as key_one / key_other (and Arabic's other forms).
      const exists = (dict: unknown) => typeof lookup(dict, key) === 'string' || typeof lookup(dict, `${key}_other`) === 'string';
      return [...(exists(en) ? [] : [`en: ${key}`]), ...(exists(ar) ? [] : [`ar: ${key}`])];
    });
    expect(missing).toEqual([]);
  });

  it('the history count has every Arabic plural form', () => {
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      expect(typeof lookup(ar, `qr.history.count_${form}`), form).toBe('string');
    }
  });
});
