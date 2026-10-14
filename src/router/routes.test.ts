// Module 16 · Platform foundation — the route table: nav tabs point at real pages, each area is
// guarded by the right roles, and every admin screen asks for a permission.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { featureForPath } from '@/lib/permissions/routeFeatures';
import { TAB_ROOT_PATHS } from '@/lib/tabRootPaths';

type RouteInfo = { path: string; roles: string[] | null };

/**
 * Reads the <Route> tree of AppRouter.tsx: full paths (children joined to their parents) and the
 * roles of the nearest ProtectedRoute above each one. Relies on one <Route> per line, as the file
 * is written today; the "reads the whole table" test fails if that stops being true.
 */
function readRoutes(source: string): RouteInfo[] {
  const stack: RouteInfo[] = [{ path: '', roles: null }];
  const routes: RouteInfo[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('</Route>')) {
      stack.pop();
      continue;
    }
    if (!line.startsWith('<Route ')) continue;

    const parent = stack[stack.length - 1];
    const own = /\bpath="([^"]*)"/.exec(line)?.[1];
    const roleList = /allowedRoles=\{\[([^\]]*)\]/.exec(line)?.[1];
    const route: RouteInfo = {
      path: own === undefined ? parent.path : own.startsWith('/') ? own : `${parent.path}/${own}`,
      roles: roleList ? [...roleList.matchAll(/'([^']+)'/g)].map((m) => m[1]) : parent.roles,
    };
    if (own !== undefined || /\bindex\b/.test(line)) routes.push(route);
    if (!line.endsWith('/>')) stack.push(route);
  }
  return routes;
}

const routes = readRoutes(readFileSync(path.resolve(__dirname, 'AppRouter.tsx'), 'utf8'));
const paths = new Set(routes.map((r) => r.path));
const under = (prefix: string) => routes.filter((r) => r.path === prefix || r.path.startsWith(`${prefix}/`));

describe('route table', () => {
  it('reads the whole table', () => {
    expect(routes.length).toBeGreaterThan(200);
    expect(paths).toContain('/admin/invoices/:invoiceId');
  });

  it('every navigation tab opens a real page', () => {
    const missing = [...TAB_ROOT_PATHS].filter((tab) => !paths.has(tab));
    expect(missing).toEqual([]);
  });
});

describe('who can open each area', () => {
  it('only the XO super admin opens the XO admin area', () => {
    for (const route of under('/xo-admin')) expect(route.roles, route.path).toEqual(['xo_super_admin']);
  });

  it('only parents open the parent area', () => {
    for (const route of under('/parent')) expect(route.roles, route.path).toEqual(['parent']);
  });

  it('parents never open the admin or teacher areas', () => {
    for (const route of [...under('/admin'), ...under('/teacher')]) {
      expect(route.roles, route.path).not.toBeNull();
      expect(route.roles, route.path).not.toContain('parent');
    }
  });

  it('sign-in and sign-up stay public', () => {
    for (const open of ['/login', '/signup', '/signup/success']) {
      expect(routes.find((r) => r.path === open)?.roles, open).toBeNull();
    }
  });
});

describe('admin screens need a permission', () => {
  // Screens every staff member may open. Anything else under /admin must map to a feature in
  // routeFeatures.ts, or a manager without that permission could open it.
  const OPEN_ADMIN_SCREENS = [
    '/admin', // known gap: the dashboard shows money totals to teachers (task T1.5)
    '/admin/onboarding',
    '/admin/onboarding/details',
    '/admin/onboarding/hours',
    '/admin/onboarding/class',
    '/admin/onboarding/invite',
    '/admin/onboarding/done',
    '/admin/profile',
    '/admin/inbox',
    '/admin/notifications',
    '/admin/reminders',
  ];

  it('every other admin screen maps to a permission', () => {
    const unguarded = under('/admin')
      .map((r) => r.path)
      .filter((p) => !OPEN_ADMIN_SCREENS.includes(p) && featureForPath(p.replace(/:[^/]+/g, 'x')) === null);
    expect(unguarded).toEqual([]);
  });
});
