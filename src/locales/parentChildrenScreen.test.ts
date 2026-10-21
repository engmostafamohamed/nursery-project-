// The parent's children page: every text it shows exists in English and Arabic (it used to show
// English defaults in both languages), including the plural forms of the invoice count.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const code = readFileSync(path.resolve(__dirname, '../pages/parent/ParentChildrenPage.tsx'), 'utf8');

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('parent children page', () => {
  it('every key it uses exists in English and Arabic', () => {
    const keys = [...new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
    const missing = keys.flatMap((key) => {
      // A plural key lives as key_one / key_other (and Arabic's other forms).
      const exists = (dict: unknown) => typeof lookup(dict, key) === 'string' || typeof lookup(dict, `${key}_other`) === 'string';
      return [...(exists(en) ? [] : [`en: ${key}`]), ...(exists(ar) ? [] : [`ar: ${key}`])];
    });
    expect(missing).toEqual([]);
  });

  it('the invoice count has every Arabic plural form', () => {
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      expect(typeof lookup(ar, `parent.children.invoiceCount_${form}`), form).toBe('string');
    }
  });
});
