// A child's attendance history (admin child record, admin report, parent attendance page): every
// text it shows comes from the locale files, in both languages, and none is written into the
// screen in English.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const root = path.resolve(__dirname, '..');
const SCREENS = [
  'components/attendance/ChildAttendanceHistory.tsx',
  'components/attendance/AttendanceHistoryCharts.tsx',
  'components/attendance/AttendanceHistoryLog.tsx',
];

const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

function staticKeys(code: string): string[] {
  return [...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
}

describe('child attendance history screens', () => {
  it.each(SCREENS)('%s: every translation key exists in English and Arabic', (file) => {
    const missing = staticKeys(source(file)).flatMap((key) => [
      ...(typeof lookup(en, key) === 'string' ? [] : [`en: ${key}`]),
      ...(typeof lookup(ar, key) === 'string' ? [] : [`ar: ${key}`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('every day status, check-in method and absence reason it can show has both languages', () => {
    const keys = [
      ...['present', 'partial', 'holiday'].map((status) => `attendance.status.${status}`),
      ...['qr_parent', 'qr_custom', 'manual'].map((method) => `attendance.method.${method}`),
      ...['sick', 'travel', 'family', 'other'].map((reason) => `attendance.absence.reasons.${reason}`),
      'admin.children.childRecord.tabAttendance',
      'admin.children.childRecord.tabBilling',
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar: ${key}`).toBe('string');
    }
  });

  it('the English and Arabic history texts have the same keys', () => {
    const flatten = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k))
        : [prefix];
    expect(flatten(lookup(ar, 'attendanceHistory')).sort()).toEqual(flatten(lookup(en, 'attendanceHistory')).sort());
  });

  it.each(SCREENS)('%s: no English text written into the screen', (file) => {
    const code = source(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const textNodes = [...code.matchAll(/>([^<>{}]*)</g)]
      .map((m) => m[1].trim())
      .filter((text) => /[A-Za-z]{2,}/.test(text) && !/[(){};=?&|]/.test(text));
    const attributes = [...code.matchAll(/\b(?:placeholder|title|label|aria-label|description)="([^"]*[A-Za-z]{2,}[^"]*)"/g)].map((m) => m[1]);
    expect([...textNodes, ...attributes]).toEqual([]);
  });
});
