// The admin dashboard and its cards (alerts, attendance KPIs, activity, quick actions, trends):
// every text they show exists in English and Arabic.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../pages/admin/AdminDashboardPage.tsx',
  '../components/admin/attendance/AttendanceKpiPanel.tsx',
  '../components/admin/DashboardAlertsBar.tsx',
  '../components/admin/DashboardQuickActions.tsx',
  '../components/admin/AdminDashboardActivityFeed.tsx',
  '../components/admin/DashboardMiniCharts.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('admin dashboard', () => {
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

  it('the dashboard counts have every Arabic plural form', () => {
    for (const key of ['admin.dashboard.activityCount', 'admin.dashboard.charts.childrenCount']) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        expect(typeof lookup(ar, `${key}_${form}`), `${key}_${form}`).toBe('string');
      }
    }
  });
});
