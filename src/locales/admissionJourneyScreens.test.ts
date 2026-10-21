// A child's admission journey (admin child record, parent children page): every text it shows
// comes from the locale files, in both languages, and none is written into the screen in English.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AdmissionStepKey } from '@/lib/admissionTimeline';

import ar from './ar.json';
import en from './en.json';

const root = path.resolve(__dirname, '..');
const SCREEN = 'components/admissions/AdmissionJourney.tsx';
const STEPS: AdmissionStepKey[] = ['started', 'submitted', 'paid', 'approved', 'joined', 'firstDay'];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

function flatten(node: unknown, prefix = ''): string[] {
  return node && typeof node === 'object'
    ? Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];
}

describe('admission journey screens', () => {
  it('every key the journey uses exists in English and Arabic', () => {
    const code = readFileSync(path.join(root, SCREEN), 'utf8');
    const keys = [
      ...[...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]),
      ...STEPS.map((step) => `admissionJourney.steps.${step}`),
      'admissionJourney.open',
      'admissionJourney.joinedShort',
    ];
    const missing = keys.flatMap((key) => [
      ...(typeof lookup(en, key) === 'string' ? [] : [`en: ${key}`]),
      ...(typeof lookup(ar, key) === 'string' ? [] : [`ar: ${key}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('the English and Arabic journey texts have the same keys', () => {
    expect(flatten(lookup(ar, 'admissionJourney')).sort()).toEqual(flatten(lookup(en, 'admissionJourney')).sort());
  });

  it('no English text written into the screen', () => {
    const code = readFileSync(path.join(root, SCREEN), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const textNodes = [...code.matchAll(/>([^<>{}]*)</g)]
      .map((m) => m[1].trim())
      .filter((text) => /[A-Za-z]{2,}/.test(text) && !/[(){};=?&|]/.test(text));
    expect(textNodes).toEqual([]);
  });
});
