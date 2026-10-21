// The list pages that share the table kit (DataTable, FilterBar, Pagination): every text they show
// exists in English and Arabic, including the plural forms of their result counts.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../pages/admin/AdminStaffDirectoryPage.tsx',
  '../components/admin/staff/StaffDirectoryTable.tsx',
  '../pages/admin/AdminClassesListPage.tsx',
  '../pages/admin/AdminApplicationsPage.tsx',
  '../pages/admin/AdminAttendancePage.tsx',
  '../pages/admin/AdminChildrenListPage.tsx',
  '../pages/admin/AdminAttendanceLogsPage.tsx',
  '../pages/admin/AdminInvoicesPage.tsx',
  '../pages/admin/AdminInquiriesPage.tsx',
  '../pages/admin/AdminPayrollPage.tsx',
  '../pages/admin/AdminDealsPage.tsx',
  '../pages/xo-admin/NurseryListPage.tsx',
  '../pages/xo-admin/XoAdminPaymentsPage.tsx',
  '../components/ui/Pagination.tsx',
  '../components/ui/FilterBar.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('admin list pages', () => {
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

  it('the result counts have every Arabic plural form', () => {
    for (const key of [
      'staff.directory.resultsCount',
      'admin.classes.list.resultsCount',
      'applications.resultsCount',
      'admissions.resultsCount',
      'attendance.logs.resultsCount',
      'deals.resultsCount',
    ]) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        expect(typeof lookup(ar, `${key}_${form}`), `${key}_${form}`).toBe('string');
      }
    }
  });
});
