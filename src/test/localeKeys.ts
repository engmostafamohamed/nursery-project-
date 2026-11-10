/*
 * For tests: whether texts exist in English and Arabic, including the ones a screen names with
 * t('…'), and the Arabic plural forms of counted texts.
 */
import { readFileSync } from 'node:fs';

import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

const DICTS = { en, ar } as const;
const ARABIC_PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

export function lookupText(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

/** The text itself, or its plural forms (key_other). */
export const textExists = (dict: unknown, key: string) =>
  typeof lookupText(dict, key) === 'string' || typeof lookupText(dict, `${key}_other`) === 'string';

/** The keys missing in a language, as "en: key" / "ar: key"; empty when all exist. */
export function missingTexts(keys: readonly string[]): string[] {
  return keys.flatMap((key) => (Object.entries(DICTS) as Array<[string, unknown]>).flatMap(([lang, dict]) => (textExists(dict, key) ? [] : [`${lang}: ${key}`])));
}

/** Every text a file names with t('…'), each once. */
export function textKeysIn(files: readonly string[]): string[] {
  return [...new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1])))];
}

/** The Arabic plural forms a counted text lacks, as "key_form". */
export function missingArabicPlurals(keys: readonly string[]): string[] {
  return keys.flatMap((key) => ARABIC_PLURALS.filter((form) => typeof lookupText(ar, `${key}_${form}`) !== 'string').map((form) => `${key}_${form}`));
}
