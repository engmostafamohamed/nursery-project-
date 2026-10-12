import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { RoleEditor } from '@/components/admin/rbac/RoleEditor';
import { roleTypeOf } from '@/components/admin/rbac/roleType';
import { roleLabel } from '@/components/admin/rbac/roleLabel';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useFeatures } from '@/hooks/useFeatures';
import { useNurseryStaffRoles, useRoles, type RoleRow } from '@/hooks/useRoles';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';

/** A nursery's own roles, or the platform templates new nurseries copy (XO only). */
type Scope = 'nursery' | 'templates';
/** The role being edited, 'new' while creating one, or nothing. */
type Selection = string | null;
const NEW_ROLE = 'new';

/** Admin roles always have every permission; they manage the staff roles (rbac_manages_nursery). */
const MANAGING_ROLES: ReadonlySet<string> = new Set(['xo_super_admin', 'chain_super_admin', 'branch_admin']);

export function AdminRolesPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile, isPending: profilePending } = useUserProfile(user?.id);
  const { activeNurseryId, isLoading: nurseryLoading } = useActiveNurseryId();
  // Until the profile and nursery are known, neither the nursery nor the access level is.
  const resolving = profilePending || nurseryLoading;
  const isXo = profile?.role === 'xo_super_admin';

  const [scope, setScope] = useState<Scope>('nursery');
  const [selection, setSelection] = useState<Selection>(null);
  const [dirty, setDirty] = useState(false);

  const nurseryId = scope === 'templates' ? null : activeNurseryId;
  const canManage = Boolean(profile && MANAGING_ROLES.has(profile.role)) && (scope === 'nursery' || isXo);

  const roles = useRoles({ nurseryId });
  const features = useFeatures();
  const staff = useNurseryStaffRoles(nurseryId);

  // Only staff roles are editable; admin and parent roles are fixed.
  const staffRoles = useMemo(
    () => (roles.data ?? []).filter((r) => r.base_role === 'manager' || r.base_role === 'teacher'),
    [roles.data],
  );
  const usersByRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of staff.data ?? []) {
      if (member.role_id) counts.set(member.role_id, (counts.get(member.role_id) ?? 0) + 1);
    }
    return counts;
  }, [staff.data]);

  const selectedRole = selection && selection !== NEW_ROLE ? staffRoles.find((r) => r.id === selection) ?? null : null;

  /** Leaving a role with unsaved changes asks first. */
  const leaveEditor = async (): Promise<boolean> => {
    if (!dirty) return true;
    const ok = await confirm({
      title: t('rbac.page.discardTitle'),
      description: t('rbac.page.discardBody'),
      confirmText: t('rbac.page.discardConfirm'),
      variant: 'danger',
    });
    if (ok) setDirty(false);
    return ok;
  };

  const select = async (next: Selection) => {
    if (next === selection || !(await leaveEditor())) return;
    setSelection(next);
  };

  const switchScope = async (next: Scope) => {
    if (next === scope || !(await leaveEditor())) return;
    setScope(next);
    setSelection(null);
  };

  if (scope === 'nursery' && !resolving && !activeNurseryId) {
    return (
      <PageShell isXo={isXo} scope={scope} onScope={switchScope}>
        <Notice icon="domain_disabled" text={t('rbac.page.noNursery')} />
      </PageShell>
    );
  }

  const loading = resolving || roles.isPending || features.isPending;
  const failed = roles.isError || features.isError;

  return (
    <PageShell isXo={isXo} scope={scope} onScope={switchScope}>
      {!resolving && !canManage ? <Notice icon="visibility" text={t('rbac.page.readOnly')} /> : null}

      {failed ? (
        <Notice icon="error" text={t('rbac.page.loadError')} tone="error" />
      ) : loading ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[18rem_1fr]">
          <RoleList
            roles={staffRoles}
            usersByRole={usersByRole}
            selection={selection}
            canCreate={canManage}
            onSelect={(id) => void select(id)}
          />
          <div className="min-w-0">
            {selection === NEW_ROLE ? (
              <RoleEditor
                key={NEW_ROLE}
                role={null}
                nurseryId={nurseryId}
                features={features.data ?? []}
                usersCount={0}
                readOnly={!canManage}
                onSaved={(id) => setSelection(id)}
                onDeleted={() => setSelection(null)}
                onCancelNew={() => setSelection(null)}
                onDirtyChange={setDirty}
              />
            ) : selectedRole ? (
              <RoleEditor
                key={selectedRole.id}
                role={selectedRole}
                nurseryId={nurseryId}
                features={features.data ?? []}
                usersCount={usersByRole.get(selectedRole.id) ?? 0}
                readOnly={!canManage}
                onSaved={(id) => setSelection(id)}
                onDeleted={() => setSelection(null)}
                onCancelNew={() => setSelection(null)}
                onDirtyChange={setDirty}
              />
            ) : selection && roles.isFetching ? (
              // A role that was just created appears once the list refreshes.
              <Skeleton className="h-96 w-full" />
            ) : (
              <Notice icon="touch_app" text={t('rbac.page.selectHint')} />
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PageShell({
  isXo,
  scope,
  onScope,
  children,
}: {
  isXo: boolean;
  scope: Scope;
  onScope: (next: Scope) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
            <MaterialSymbol name="shield_person" className="text-primary" size="text-2xl" />
            {t('rbac.page.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            {scope === 'templates' ? t('rbac.page.templatesHint') : t('rbac.page.subtitle')}
          </p>
        </div>
        {isXo ? (
          <div className="inline-flex rounded-xl border border-outline-variant bg-surface-container-lowest p-1" role="group">
            {(['nursery', 'templates'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => onScope(value)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  scope === value ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container',
                )}
              >
                {value === 'nursery' ? t('rbac.page.scopeNursery') : t('rbac.page.scopeTemplates')}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

function RoleList({
  roles,
  usersByRole,
  selection,
  canCreate,
  onSelect,
}: {
  roles: readonly RoleRow[];
  usersByRole: ReadonlyMap<string, number>;
  selection: Selection;
  canCreate: boolean;
  onSelect: (id: Selection) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-on-surface">
          {t('rbac.page.listTitle', { total: roles.length })}
        </h2>
        {canCreate ? (
          <Button type="button" size="sm" onClick={() => onSelect(NEW_ROLE)} disabled={selection === NEW_ROLE}>
            <MaterialSymbol name="add" size="text-base" className="me-1" />
            {t('rbac.page.newRole')}
          </Button>
        ) : null}
      </div>
      {roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-4 text-center text-sm text-on-surface-variant">
          {t('rbac.page.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {roles.map((role) => {
            const active = selection === role.id;
            const locked = role.is_system || role.is_seed;
            return (
              <li key={role.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(role.id)}
                  className={cn(
                    'w-full rounded-xl border px-3 py-2 text-start transition-colors',
                    active ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-surface-container',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-on-surface">{roleLabel(role, i18n.language, t)}</span>
                    {locked ? <MaterialSymbol name="lock" size="text-sm" className="shrink-0 text-on-surface-variant" /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-on-surface-variant">
                    {t(`rbac.types.${roleTypeOf(role).replace(':', '_')}`)}
                    {' · '}
                    {t('rbac.page.usersCount', { count: usersByRole.get(role.id) ?? 0 })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Notice({ icon, text, tone }: { icon: string; text: string; tone?: 'error' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-2xl border p-4 text-sm',
        tone === 'error'
          ? 'border-error/30 bg-error/5 text-error'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant',
      )}
    >
      <MaterialSymbol name={icon} size="text-lg" className="shrink-0" />
      <span>{text}</span>
    </p>
  );
}
