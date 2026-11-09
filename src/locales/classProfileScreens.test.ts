// The class screens (the classes list, a class's page and its parts): every text they show comes from
// the locale files, in both languages, and none is written into the screen in English.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHILD_ABSENCE_REASONS, CHILD_FILTERS } from '@/features/classes/classProfile';

import ar from './ar.json';
import en from './en.json';

const root = path.resolve(__dirname, '..');
const SCREENS = [
  'pages/admin/AdminClassesListPage.tsx',
  'pages/admin/AdminClassProfilePage.tsx',
  'features/classes/ClassProfileView.tsx',
  'features/classes/ClassProfileHero.tsx',
  'features/classes/ClassTodayTiles.tsx',
  'features/classes/ClassChildrenPanel.tsx',
  'features/classes/ClassTeamPanel.tsx',
  'features/classes/ClassActivityPanel.tsx',
  'features/classes/ClassWaitlistPanel.tsx',
  'features/classes/ClassDetailsPanel.tsx',
  'features/classes/ClassProfilePageState.tsx',
  'features/classes/ClassCapacityMeter.tsx',
  'features/classes/useClassFormat.ts',
];

const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

const exists = (dict: unknown, key: string) => typeof lookup(dict, key) === 'string' || typeof lookup(dict, `${key}_other`) === 'string';

describe('class screens', () => {
  it.each(SCREENS)('%s: every translation key exists in English and Arabic', (file) => {
    const keys = [...source(file).matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
    const missing = keys.flatMap((key) => [...(exists(en, key) ? [] : [`en: ${key}`]), ...(exists(ar, key) ? [] : [`ar: ${key}`])]);
    expect(missing).toEqual([]);
  });

  it('every state the page names has both languages', () => {
    const keys = [
      ...['present', 'partial', 'absent', 'excused', 'off', 'not_enrolled'].map((s) => `classProfile.attendance.${s}`),
      ...['on_duty', 'covering', 'away', 'standby', 'inactive'].map((s) => `classProfile.duty.${s}`),
      ...CHILD_FILTERS.map((f) => `classProfile.filters.${f}`),
      ...['sent', 'scheduled', 'draft', 'failed'].map((s) => `classProfile.activity.status.${s}`),
      ...['covered', 'uncovered', 'no_lead'].map((s) => `classProfile.team.cover.${s}`),
      ...['notFound', 'forbidden', 'network', 'failed'].map((s) => `classProfile.errors.${s}`),
      // Reused from other screens.
      ...CHILD_ABSENCE_REASONS.map((r) => `attendance.absence.reasons.${r}`),
      ...['sent', 'in_progress', 'not_started', 'not_expected'].map((s) => `dailyReport.stage.${s}`),
      ...['lead', 'assistant', 'substitute'].map((r) => `classTeam.roles.${r}`),
      ...['assigned', 'changed', 'removed'].map((a) => `classTeam.changes.${a}`),
      ...['uncovered', 'covered', 'no_lead', 'normal'].map((s) => `staffAbsence.board.status.${s}`),
      ...['sick', 'personal', 'vacation', 'training', 'other'].map((r) => `staffAbsence.reasons.${r}`),
      ...['mild', 'moderate', 'severe', 'life_threatening'].map((s) => `health.severity.allergy.${s}`),
    ];
    for (const key of keys) {
      expect(typeof lookup(en, key), `en: ${key}`).toBe('string');
      expect(typeof lookup(ar, key), `ar: ${key}`).toBe('string');
    }
  });

  it('counts have every Arabic plural form', () => {
    const counts = [
      'classProfile.today.ofExpected',
      'classProfile.today.excused',
      'classProfile.today.reportsDue',
      'classProfile.today.seriousAllergies',
      'classProfile.health.more',
      'classProfile.health.conditions',
      'classProfile.health.medications',
      'classProfile.children.count',
      'classProfile.team.count',
      'classProfile.waitlist.count',
      'classProfile.details.camerasCount',
    ];
    for (const key of counts) {
      expect(typeof lookup(en, `${key}_one`), `en: ${key}_one`).toBe('string');
      expect(typeof lookup(en, `${key}_other`), `en: ${key}_other`).toBe('string');
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        expect(typeof lookup(ar, `${key}_${form}`), `ar: ${key}_${form}`).toBe('string');
      }
    }
  });

  it.each(SCREENS.filter((file) => file.endsWith('.tsx')))('%s: no English text written into the screen', (file) => {
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
