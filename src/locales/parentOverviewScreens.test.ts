// The parent's home, daily reports and attendance pages: every text they show exists in English
// and Arabic. Many keys used to exist only as English defaults in the code, so Arabic showed English.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../pages/parent/ParentDashboardPage.tsx',
  '../pages/parent/ParentDailyReportsPage.tsx',
  '../pages/parent/ParentAttendanceHistoryPage.tsx',
  '../components/parent/ChildSelector.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('parent overview pages', () => {
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

  it('the attendance counts have every Arabic plural form', () => {
    for (const key of ['schoolDaysCount', 'filteredCount']) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        expect(typeof lookup(ar, `parent.attendanceHistory.${key}_${form}`), `${key}_${form}`).toBe('string');
      }
    }
  });
});
