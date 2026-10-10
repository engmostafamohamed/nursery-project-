import type { FeatureRow } from '@/hooks/useFeatures';
import type { RoleFeatureRow, RoleGrant } from '@/hooks/useRoles';
import type { Action } from '@/lib/permissions/types';

/** A role's permissions while they are being edited: module id → granted actions. */
export type GrantDraft = Readonly<Record<string, { actions: readonly Action[]; requiresApproval: boolean }>>;

/** Display order of module groups; unknown categories go last. */
export const CATEGORY_ORDER = ['operations', 'children', 'staff', 'finance', 'communication', 'content', 'settings'];

export function draftFromRows(rows: readonly RoleFeatureRow[]): GrantDraft {
  const draft: Record<string, { actions: readonly Action[]; requiresApproval: boolean }> = {};
  for (const row of rows) {
    if (row.actions.length > 0) draft[row.feature_id] = { actions: row.actions, requiresApproval: row.requires_approval };
  }
  return draft;
}

export function draftToGrants(draft: GrantDraft): RoleGrant[] {
  return Object.entries(draft).map(([feature, grant]) => ({
    feature,
    actions: [...grant.actions],
    requires_approval: grant.requiresApproval,
  }));
}

function withActions(draft: GrantDraft, feature: FeatureRow, actions: ReadonlySet<Action>): GrantDraft {
  const next = { ...draft };
  // Same rule as the server: any action means the module is visible; no view means no access.
  const kept = feature.actions.filter((a) => actions.has(a));
  if (kept.length > 0 && !kept.includes('view') && feature.actions.includes('view')) kept.unshift('view');
  if (kept.length === 0 || !kept.includes('view')) {
    delete next[feature.id];
  } else {
    next[feature.id] = { actions: kept, requiresApproval: draft[feature.id]?.requiresApproval ?? false };
  }
  return next;
}

export function toggleAction(draft: GrantDraft, feature: FeatureRow, action: Action): GrantDraft {
  const current = new Set(draft[feature.id]?.actions ?? []);
  if (current.has(action)) {
    if (action === 'view') return withActions(draft, feature, new Set());
    current.delete(action);
  } else {
    current.add(action);
  }
  return withActions(draft, feature, current);
}

export function setFeaturesAll(draft: GrantDraft, features: readonly FeatureRow[], on: boolean): GrantDraft {
  let next = draft;
  for (const feature of features) next = withActions(next, feature, new Set(on ? feature.actions : []));
  return next;
}

export function setApproval(draft: GrantDraft, featureId: string, on: boolean): GrantDraft {
  const grant = draft[featureId];
  if (!grant) return draft;
  return { ...draft, [featureId]: { ...grant, requiresApproval: on } };
}

export function isFullyGranted(draft: GrantDraft, feature: FeatureRow): boolean {
  return (draft[feature.id]?.actions.length ?? 0) === feature.actions.length;
}

export function sameDraft(a: GrantDraft, b: GrantDraft): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => {
    const x = a[key];
    const y = b[key];
    if (!y || x.requiresApproval !== y.requiresApproval || x.actions.length !== y.actions.length) return false;
    return x.actions.every((action) => y.actions.includes(action));
  });
}
