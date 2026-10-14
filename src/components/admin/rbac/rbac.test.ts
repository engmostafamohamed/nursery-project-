// Module 14 · Roles & permissions — the roles editor's permission draft and role types.
import { describe, expect, it } from 'vitest';

import type { FeatureRow } from '@/hooks/useFeatures';
import i18n from '@/lib/i18n';

import {
  draftFromRows,
  draftToGrants,
  isFullyGranted,
  sameDraft,
  setApproval,
  setFeaturesAll,
  toggleAction,
  type GrantDraft,
} from './permissionDraft';
import { roleLabel } from './roleLabel';
import { roleTypeOf, splitRoleType } from './roleType';

function feature(id: string, actions: FeatureRow['actions']): FeatureRow {
  return {
    id,
    actions,
    name_en: id,
    name_ar: id,
    category: 'finance',
    description_en: null,
    description_ar: null,
    sort_order: 0,
    is_seed: true,
    created_at: '',
    updated_at: '',
  };
}

const invoices = feature('invoices', ['view', 'create', 'update', 'delete', 'export']);
const scanner = feature('qr_scanner', ['view']);

describe('toggleAction', () => {
  it('turning on any action also turns on view', () => {
    const draft = toggleAction({}, invoices, 'create');
    expect(draft.invoices.actions).toEqual(['view', 'create']);
  });

  it('turning off view removes the whole module', () => {
    const draft = toggleAction({ invoices: { actions: ['view', 'create'], requiresApproval: false } }, invoices, 'view');
    expect(draft).toEqual({});
  });

  it('turning off another action keeps view', () => {
    const draft = toggleAction({ invoices: { actions: ['view', 'create'], requiresApproval: false } }, invoices, 'create');
    expect(draft.invoices.actions).toEqual(['view']);
  });

  it('ignores actions the module does not support', () => {
    const draft = toggleAction({}, scanner, 'delete');
    expect(draft).toEqual({});
  });

  it('keeps the approval flag when actions change', () => {
    const start: GrantDraft = { invoices: { actions: ['view'], requiresApproval: true } };
    expect(toggleAction(start, invoices, 'export').invoices.requiresApproval).toBe(true);
  });
});

describe('setFeaturesAll', () => {
  it('grants every supported action, then clears them', () => {
    const all = setFeaturesAll({}, [invoices, scanner], true);
    expect(isFullyGranted(all, invoices)).toBe(true);
    expect(isFullyGranted(all, scanner)).toBe(true);
    expect(setFeaturesAll(all, [invoices, scanner], false)).toEqual({});
  });
});

describe('setApproval', () => {
  it('sets the flag on a granted module only', () => {
    const draft: GrantDraft = { invoices: { actions: ['view'], requiresApproval: false } };
    expect(setApproval(draft, 'invoices', true).invoices.requiresApproval).toBe(true);
    expect(setApproval(draft, 'payroll', true)).toBe(draft);
  });
});

describe('draft conversion', () => {
  it('reads saved grants and skips rows with no actions', () => {
    const draft = draftFromRows([
      { role_id: 'r', feature_id: 'invoices', actions: ['view', 'create'], requires_approval: true },
      { role_id: 'r', feature_id: 'payroll', actions: [], requires_approval: false },
    ]);
    expect(draft).toEqual({ invoices: { actions: ['view', 'create'], requiresApproval: true } });
  });

  it('writes grants in the shape rbac_save_role expects', () => {
    const grants = draftToGrants({ invoices: { actions: ['view', 'export'], requiresApproval: false } });
    expect(grants).toEqual([{ feature: 'invoices', actions: ['view', 'export'], requires_approval: false }]);
  });
});

describe('sameDraft', () => {
  it('ignores the order of actions', () => {
    const a: GrantDraft = { invoices: { actions: ['view', 'create'], requiresApproval: false } };
    const b: GrantDraft = { invoices: { actions: ['create', 'view'], requiresApproval: false } };
    expect(sameDraft(a, b)).toBe(true);
  });

  it('notices a changed action, flag or module', () => {
    const a: GrantDraft = { invoices: { actions: ['view'], requiresApproval: false } };
    expect(sameDraft(a, { invoices: { actions: ['view', 'create'], requiresApproval: false } })).toBe(false);
    expect(sameDraft(a, { invoices: { actions: ['view'], requiresApproval: true } })).toBe(false);
    expect(sameDraft(a, { payroll: { actions: ['view'], requiresApproval: false } })).toBe(false);
  });
});

describe('role types', () => {
  it('reads a role type from its base role and department', () => {
    expect(roleTypeOf({ base_role: 'teacher', base_department: null })).toBe('teacher');
    expect(roleTypeOf({ base_role: 'manager', base_department: 'finance' })).toBe('manager:finance');
    expect(roleTypeOf({ base_role: 'manager', base_department: null })).toBe('manager:operations');
  });

  it('splits a role type back into what rbac_save_role stores', () => {
    expect(splitRoleType('teacher')).toEqual({ baseRole: 'teacher', department: null });
    expect(splitRoleType('manager:hr')).toEqual({ baseRole: 'manager', department: 'hr' });
  });
});

describe('role names', () => {
  const t = i18n.getFixedT('en');
  const role = (overrides: Partial<Parameters<typeof roleLabel>[0] & object> = {}) => ({
    key: 'custom_role',
    name_ar: 'منسق',
    name_en: 'Coordinator',
    is_system: false,
    is_seed: false,
    ...overrides,
  });

  it('shows the translated name of a built-in role', () => {
    expect(roleLabel(role({ key: 'manager_finance', is_seed: true }), 'en', t)).toBe('Finance manager');
  });

  it('shows the typed name of a role an admin created, in the reader’s language first', () => {
    expect(roleLabel(role(), 'en', t)).toBe('Coordinator');
    expect(roleLabel(role(), 'ar', t)).toBe('منسق');
    expect(roleLabel(role({ name_en: ' ' }), 'en', t)).toBe('منسق');
  });

  it('falls back to the key, or nothing for no role', () => {
    expect(roleLabel(role({ name_ar: '', name_en: '' }), 'en', t)).toBe('custom_role');
    expect(roleLabel(null, 'en', t)).toBe('');
  });
});
