import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useFeatures } from '@/hooks/useFeatures';
import {
  useRoles,
  useCreateRole,
  useDeleteRole,
  useRoleFeatures,
  useSetRoleFeatures,
  type RoleRow,
  type RoleFeatureAction,
} from '@/hooks/useRoles';

// xo_super_admin is intentionally excluded. That role is the platform-level
// escape hatch — it should never be created via the UI. To grant the powers,
// edit users.role_id directly in SQL, or assign the seeded "Super Admin" role.
const BASE_ROLES: Array<RoleRow['base_role']> = [
  'chain_super_admin',
  'branch_admin',
  'manager',
  'teacher',
  'parent',
];

const DEPARTMENTS: Array<NonNullable<RoleRow['base_department']>> = ['finance', 'hr', 'operations'];

const ACTIONS: RoleFeatureAction[] = ['view', 'create', 'update', 'delete'];

interface RowState {
  actions: Set<RoleFeatureAction>;
  requires_approval: boolean;
}

export function AdminRolesPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;
  const isXo = profile?.role === 'xo_super_admin';

  const roles = useRoles();
  const features = useFeatures();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const setFeatures = useSetRoleFeatures();

  const [keyVal, setKeyVal] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [baseRole, setBaseRole] = useState<RoleRow['base_role']>('teacher');
  const [baseDept, setBaseDept] = useState<RoleRow['base_department']>(null);
  const [scope, setScope] = useState<'nursery' | 'platform'>('nursery');

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const selectedRole = (roles.data ?? []).find((r) => r.id === selectedRoleId) ?? null;
  const roleFeatures = useRoleFeatures(selectedRoleId);

  // Editable state — keyed by feature_id. Defaults to empty.
  const [grantState, setGrantState] = useState<Map<string, RowState>>(new Map());

  useEffect(() => {
    if (roleFeatures.data) {
      const next = new Map<string, RowState>();
      for (const rf of roleFeatures.data) {
        next.set(rf.feature_id, {
          actions: new Set(rf.actions),
          requires_approval: rf.requires_approval,
        });
      }
      setGrantState(next);
    }
  }, [roleFeatures.data]);

  const handleCreate = async () => {
    if (!keyVal || !nameEn || !nameAr) {
      toast.error('Key + names are required');
      return;
    }
    try {
      const created = await createRole.mutateAsync({
        key: keyVal,
        name_en: nameEn,
        name_ar: nameAr,
        base_role: baseRole,
        base_department: baseRole === 'manager' ? baseDept : null,
        nursery_id: scope === 'platform' ? null : nurseryId,
      });
      toast.success('Role created — now pick its features below');
      setKeyVal('');
      setNameEn('');
      setNameAr('');
      setSelectedRoleId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create role');
    }
  };

  const handleDelete = async (id: string, isSeed: boolean) => {
    if (isSeed && !isXo) {
      toast.error('Only Super Admin can delete seed roles');
      return;
    }
    if (!(await confirm({ description: 'Delete this role?', variant: 'danger' }))) return;
    try {
      await deleteRole.mutateAsync(id);
      toast.success('Role deleted');
      if (selectedRoleId === id) setSelectedRoleId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const toggleAction = (featureId: string, action: RoleFeatureAction) => {
    setGrantState((prev) => {
      const next = new Map(prev);
      const current = next.get(featureId) ?? { actions: new Set(), requires_approval: false };
      const actions = new Set(current.actions);
      if (actions.has(action)) {
        actions.delete(action);
        // If we just turned off 'view', drop all other actions (view is the gatekeeper).
        if (action === 'view') {
          actions.clear();
        }
      } else {
        actions.add(action);
        // Granting any non-view action implies view too.
        if (action !== 'view') actions.add('view');
      }
      if (actions.size === 0) {
        next.delete(featureId);
      } else {
        next.set(featureId, { actions, requires_approval: current.requires_approval });
      }
      return next;
    });
  };

  const toggleRequiresApproval = (featureId: string) => {
    setGrantState((prev) => {
      const current = prev.get(featureId);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(featureId, { ...current, requires_approval: !current.requires_approval });
      return next;
    });
  };

  const setAllActionsForFeature = (featureId: string, on: boolean) => {
    setGrantState((prev) => {
      const next = new Map(prev);
      if (on) {
        next.set(featureId, {
          actions: new Set(ACTIONS),
          requires_approval: next.get(featureId)?.requires_approval ?? false,
        });
      } else {
        next.delete(featureId);
      }
      return next;
    });
  };

  const handleSaveFeatures = async () => {
    if (!selectedRoleId) return;
    // Guard: seed roles drive the migrated permission matrix. Overwriting them
    // changes the meaning of "Teacher" / "Branch Admin" etc. for every user
    // on that role. Require explicit confirmation.
    if (selectedRole?.is_seed) {
      const ok = await confirm({
        title: 'Overwrite seed role?',
        description:
          `"${lang === 'ar' ? selectedRole.name_ar : selectedRole.name_en}" is a SEED role. ` +
          'Changing its features affects every user currently assigned to it ' +
          '(including demo accounts and the matrix migrated from the spreadsheet). ' +
          'To make a custom role with a different feature set, click "+ Create role" instead. ' +
          'Continue saving over the seed role?',
        variant: 'danger',
        confirmText: 'Continue',
      });
      if (!ok) return;
    }
    try {
      const grants = Array.from(grantState.entries()).map(([feature_id, state]) => ({
        feature_id,
        actions: Array.from(state.actions),
        requires_approval: state.requires_approval,
      }));
      await setFeatures.mutateAsync({ roleId: selectedRoleId, grants });
      toast.success('Features saved for this role');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  if (!isXo) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-16 text-center">
        <MaterialSymbol name="lock" className="text-error" size="text-2xl" />
        <h1 className="text-lg font-semibold text-on-surface">Super Admin only</h1>
        <p className="text-sm text-on-surface-variant">
          Role management is restricted to Super Admin. Branch admins assign existing
          roles to staff via positions (in the Staff Onboarding form); they cannot
          create or edit role definitions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <MaterialSymbol name="shield_person" className="text-primary" size="text-2xl" />
          Roles
        </h1>
        <p className="text-sm text-on-surface-variant">
          Each role has a base role (drives data-level access via RLS) and, per feature, the set of
          CRUD actions it grants (drives UI button visibility). When a position is assigned to a
          staff member, the role attached to that position auto-syncs to their user record.
        </p>
      </div>

      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
        <h2 className="text-sm font-semibold">Create new role</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="role-key">Key (machine name)</Label>
            <Input id="role-key" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="floor_supervisor" />
          </div>
          <div>
            <Label htmlFor="role-base">Base role (drives RLS)</Label>
            <Select
              id="role-base"
              value={baseRole}
              onChange={(e) => setBaseRole(e.target.value as RoleRow['base_role'])}
            >
              {BASE_ROLES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="role-name-en">Name (English)</Label>
            <Input id="role-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Floor Supervisor" />
          </div>
          <div>
            <Label htmlFor="role-name-ar">Name (Arabic)</Label>
            <Input id="role-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مشرف الطابق" />
          </div>
          {baseRole === 'manager' ? (
            <div>
              <Label htmlFor="role-dept">Manager department</Label>
              <Select
                id="role-dept"
                value={baseDept ?? ''}
                onChange={(e) => setBaseDept((e.target.value || null) as RoleRow['base_department'])}
              >
                <option value="">-- pick department --</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {isXo ? (
            <div>
              <Label htmlFor="role-scope">Scope</Label>
              <Select id="role-scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="nursery">This nursery only</option>
                <option value="platform">Platform-wide</option>
              </Select>
            </div>
          ) : null}
        </div>
        <Button onClick={handleCreate} disabled={createRole.isPending}>
          {createRole.isPending ? 'Creating…' : 'Create role'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="mb-3 text-sm font-semibold">Roles ({roles.data?.length ?? 0})</h2>
          {roles.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-1">
              {/* Hide Super Admin from the list — it's a hard-coded escape hatch, not
                  an editable role. The /admin/settings/roles editor doesn't let you
                  create or modify it. */}
              {(roles.data ?? [])
                .filter((r) => r.base_role !== 'xo_super_admin')
                .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedRoleId === r.id
                      ? 'border-primary bg-primary/5'
                      : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-low'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{lang === 'ar' ? r.name_ar : r.name_en}</span>
                    <div className="flex items-center gap-2">
                      {r.is_seed ? (
                        <span className="rounded bg-info/10 px-2 py-0.5 text-xs text-info">Seed</span>
                      ) : (
                        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Custom</span>
                      )}
                      {r.base_role === 'xo_super_admin' ? null : !r.is_seed || isXo ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(r.id, r.is_seed);
                          }}
                          className="text-error hover:bg-error/10 rounded p-1"
                          aria-label="delete"
                        >
                          <MaterialSymbol name="delete" size="text-base" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-on-surface-variant">
                    {r.base_role}
                    {r.base_department ? ` / ${r.base_department}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">
            Features for{' '}
            {selectedRole
              ? `"${lang === 'ar' ? selectedRole.name_ar : selectedRole.name_en}"`
              : 'selected role'}
          </h2>
          {!selectedRoleId ? (
            <p className="rounded-2xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
              Pick a role on the left to edit its feature list.
            </p>
          ) : selectedRole?.base_role === 'xo_super_admin' ? (
            <div className="rounded-2xl border border-info/40 bg-info/5 p-6 text-sm">
              <div className="flex items-start gap-3">
                <MaterialSymbol name="shield" className="text-info" size="text-2xl" />
                <div>
                  <p className="font-semibold text-info">Super Admin — full bypass</p>
                  <p className="mt-1 text-on-surface-variant">
                    Super Admin always has access to every feature (including any new feature created
                    later). This is a hard-coded short-circuit in the permission engine — there's no
                    feature checklist to configure here, and it cannot be changed from the UI.
                  </p>
                </div>
              </div>
            </div>
          ) : roleFeatures.isLoading || features.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-on-surface-variant">
                      <th className="py-2 pr-2">Feature</th>
                      {ACTIONS.map((a) => (
                        <th key={a} className="py-2 px-1 text-center uppercase tracking-wider">
                          {a.slice(0, 1).toUpperCase()}
                          <span className="block text-[10px] font-normal normal-case">{a}</span>
                        </th>
                      ))}
                      <th className="py-2 px-1 text-center" title="Actions require approval">
                        Apprv
                      </th>
                      <th className="py-2 pl-1 text-right text-[10px]">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(features.data ?? []).map((f) => {
                      const row = grantState.get(f.id);
                      const allOn = row?.actions.size === 4;
                      return (
                        <tr key={f.id} className="border-t border-outline-variant">
                          <td className="py-2 pr-2">
                            <div className="font-medium">{lang === 'ar' ? f.name_ar : f.name_en}</div>
                            <div className="text-[10px] text-on-surface-variant font-mono">{f.id}</div>
                          </td>
                          {ACTIONS.map((a) => (
                            <td key={a} className="py-2 px-1 text-center">
                              <input
                                type="checkbox"
                                checked={Boolean(row?.actions.has(a))}
                                onChange={() => toggleAction(f.id, a)}
                                aria-label={`${a} ${f.id}`}
                              />
                            </td>
                          ))}
                          <td className="py-2 px-1 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(row?.requires_approval)}
                              disabled={!row}
                              onChange={() => toggleRequiresApproval(f.id)}
                              aria-label={`requires-approval ${f.id}`}
                            />
                          </td>
                          <td className="py-2 pl-1 text-right">
                            <button
                              type="button"
                              onClick={() => setAllActionsForFeature(f.id, !allOn)}
                              className="text-[10px] text-primary hover:underline"
                            >
                              {allOn ? 'none' : 'all'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant">
                <span className="text-xs text-on-surface-variant">
                  {grantState.size} of {features.data?.length ?? 0} features granted
                </span>
                <Button onClick={handleSaveFeatures} disabled={setFeatures.isPending}>
                  {setFeatures.isPending ? 'Saving…' : 'Save features'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
