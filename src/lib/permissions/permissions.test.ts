// Module 14 · Roles & permissions — the client-side permission engine and route map.
import { describe, expect, it } from 'vitest';

import { allowedFeatures, can, evaluate, requiresApproval, roleColumn } from './can';
import { PERMISSION_MATRIX } from './matrix';
import { featureForPath } from './routeFeatures';
import type { FeatureKey } from './types';

const ALL_FEATURES = Object.keys(PERMISSION_MATRIX) as FeatureKey[];

describe('roleColumn', () => {
  it.each([
    ['xo_super_admin', 'super'],
    ['chain_super_admin', 'topManagement'],
    ['branch_admin', 'topManagement'],
    ['manager', 'manager'],
    ['teacher', 'teacher'],
    ['parent', 'none'],
  ] as const)('maps %s to the %s column', (role, column) => {
    expect(roleColumn(role)).toBe(column);
  });
});

describe('evaluate', () => {
  it('gives the XO super admin every feature without approval', () => {
    for (const feature of ALL_FEATURES) {
      expect(evaluate({ role: 'xo_super_admin' }, feature)).toEqual({ allowed: true, requiresApproval: false });
    }
  });

  it('gives branch and chain admins every feature', () => {
    for (const role of ['branch_admin', 'chain_super_admin'] as const) {
      expect(allowedFeatures({ role })).toHaveLength(ALL_FEATURES.length);
    }
  });

  it('gives parents nothing in the staff matrix', () => {
    expect(allowedFeatures({ role: 'parent' })).toEqual([]);
  });

  it('lets a finance manager into finance features only', () => {
    const finance = { role: 'manager', department: 'finance' } as const;
    expect(can(finance, 'invoices')).toBe(true);
    expect(can(finance, 'payments')).toBe(true);
    expect(can(finance, 'payroll')).toBe(false);
    expect(can(finance, 'staff')).toBe(false);
  });

  it('lets an HR manager into staff and payroll but not invoices', () => {
    const hr = { role: 'manager', department: 'hr' } as const;
    expect(can(hr, 'staff')).toBe(true);
    expect(can(hr, 'payroll')).toBe(true);
    expect(can(hr, 'invoices')).toBe(false);
  });

  it('refuses department-gated features to a manager with no department', () => {
    expect(can({ role: 'manager', department: null }, 'invoices')).toBe(false);
  });

  it('keeps settings and roles away from every manager', () => {
    for (const department of ['finance', 'hr', 'operations'] as const) {
      expect(can({ role: 'manager', department }, 'settings')).toBe(false);
      expect(can({ role: 'manager', department }, 'roles_permissions')).toBe(false);
    }
  });

  it('allows teachers media and daily reports only with approval', () => {
    const teacher = { role: 'teacher' } as const;
    expect(evaluate(teacher, 'media_library')).toEqual({ allowed: true, requiresApproval: true });
    expect(requiresApproval(teacher, 'daily_reports')).toBe(true);
    expect(requiresApproval(teacher, 'classes')).toBe(false);
  });

  it('keeps money away from teachers', () => {
    const teacher = { role: 'teacher' } as const;
    for (const feature of ['invoices', 'payments', 'payroll', 'dashboard_finance', 'financial_reports'] as const) {
      expect(can(teacher, feature)).toBe(false);
    }
  });
});

describe('featureForPath', () => {
  it.each([
    ['/admin/invoices', 'invoices'],
    ['/admin/invoices/123', 'invoices'],
    ['/admin/staff/payroll', 'payroll'],
    ['/admin/staff/onboarding', 'staff_onboarding'],
    ['/admin/staff/abc', 'staff'],
    ['/admin/children/enroll', 'child_enrollment'],
    ['/admin/children/abc/health', 'kids_applications'],
    ['/admin/reports/financial', 'financial_reports'],
    ['/admin/reports', 'daily_reports'],
    ['/admin/messages/broadcasts', 'broadcast_messages'],
    ['/admin/settings/roles', 'roles_permissions'],
    ['/admin/settings', 'settings'],
    ['/teacher/media/upload', 'upload_media'],
    ['/teacher/milestones', 'daily_reports'],
  ] as const)('%s needs %s', (path, feature) => {
    expect(featureForPath(path)).toBe(feature);
  });

  it('uses the most specific match, not the first one', () => {
    expect(featureForPath('/admin/media/upload')).toBe('upload_media');
    expect(featureForPath('/admin/media')).toBe('media_library');
  });

  it('treats XO-admin nursery screens like the admin screens', () => {
    expect(featureForPath('/xo-admin/nursery/invoices')).toBe('invoices');
    expect(featureForPath('/xo-admin/nursery/staff/payroll')).toBe('payroll');
  });

  it('ignores a trailing slash', () => {
    expect(featureForPath('/admin/invoices/')).toBe('invoices');
  });

  it('does not match a longer word that shares a prefix', () => {
    expect(featureForPath('/admin/staffing')).toBeNull();
  });

  it('needs no permission for open screens', () => {
    for (const path of ['/admin/profile', '/admin/inbox', '/admin/notifications', '/teacher', '/parent/invoices']) {
      expect(featureForPath(path)).toBeNull();
    }
  });

  // Known gap: a teacher can open the admin dashboard and see nursery money totals.
  it.todo('requires a permission for the admin dashboard itself (task T1.5)');
});
