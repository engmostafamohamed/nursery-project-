// The admin package and deal screens: every text they show comes from the locale files, in both
// languages, and none is written into the screen in English.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const root = path.resolve(__dirname, '..');
const SCREENS = [
  'pages/admin/AdminDealsPage.tsx',
  'pages/admin/AdminPackagesPage.tsx',
  'components/admin/settings/TuitionPackagesEditor.tsx',
  'components/admin/settings/TuitionPackageBillingPeriodsEditor.tsx',
  'components/admin/settings/BulkTuitionAssignDialog.tsx',
  'components/admin/settings/PackageDealPicker.tsx',
  'components/admin/settings/PackageSectionTextsCard.tsx',
  'components/admin/settings/AdminPackageCard.tsx',
  'components/admin/settings/dealLabels.ts',
];

const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

/** Static keys passed to t('...'). Template keys (`a.${b}`) are checked separately below. */
function staticKeys(code: string): string[] {
  return [...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
}

describe('admin package and deal screens', () => {
  it.each(SCREENS)('%s: every translation key exists in English and Arabic', (file) => {
    const missing = staticKeys(source(file)).flatMap((key) => [
      ...(typeof lookup(en, key) === 'string' ? [] : [`en: ${key}`]),
      ...(typeof lookup(ar, key) === 'string' ? [] : [`ar: ${key}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('every validation message, billing period and parent text field has both languages', () => {
    const errors = ['nameRequired', 'valueRequired', 'percentOver100', 'endsBeforeStart', 'hoursRequired', 'priceInvalid',
      'validityRequired', 'validityUnitRequired', 'noActivePeriod', 'periodPriceInvalid'];
    const periods = ['monthly', 'quarterly', 'half_annual', 'annual'];
    const texts = ['paymentIntro', 'tuitionIntro', 'extraHoursIntro'];
    const keys = [
      ...errors.map((code) => `packageForms.errors.${code}`),
      ...periods.map((p) => `tuitionPackages.periods.${p}`),
      ...texts.map((field) => `packageTexts.fields.${field}`),
      // The standard texts shown in the empty boxes.
      'signup.payment.description',
      'signup.payment.chooseTuitionHint',
      'signup.payment.extraHoursHint',
    ];
    // Children counts read naturally in each language's plural forms.
    for (const form of ['one', 'other']) keys.push(`packages.assignedCount_${form}`);
    for (const form of ['zero', 'two', 'few', 'many']) {
      expect(typeof lookup(ar, `packages.assignedCount_${form}`), `ar plural: ${form}`).toBe('string');
    }
    for (const key of keys) {
      expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar: ${key}`).toBe('string');
    }
  });

  it.each(SCREENS.filter((file) => file.endsWith('.tsx')))('%s: no English text written into the screen', (file) => {
    const code = source(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Text between JSX tags, outside {expressions}. A fragment with code punctuation is code that
    // happens to sit between a `>` and a `<` (generics, ternaries), not text on the screen.
    const textNodes = [...code.matchAll(/>([^<>{}]*)</g)]
      .map((m) => m[1].trim())
      .filter((text) => /[A-Za-z]{2,}/.test(text) && !/[(){};=?&|]/.test(text));
    // Human-readable attributes given as plain strings.
    const attributes = [...code.matchAll(/\b(?:placeholder|title|label|aria-label|description)="([^"]*[A-Za-z]{2,}[^"]*)"/g)].map((m) => m[1]);
    expect([...textNodes, ...attributes]).toEqual([]);
  });
});
