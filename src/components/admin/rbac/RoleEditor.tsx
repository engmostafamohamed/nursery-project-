import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeatureRow } from '@/hooks/useFeatures';
import {
  rbacErrorKey,
  useDeleteRole,
  useRoleFeatures,
  useSaveRole,
  type RoleDepartment,
  type RoleRow,
  type StaffBaseRole,
} from '@/hooks/useRoles';

import { PermissionGrid } from './PermissionGrid';
import { draftFromRows, draftToGrants, sameDraft, type GrantDraft } from './permissionDraft';
import { roleLabel } from './roleLabel';

/** The role "type": which app its people use (teacher app or admin dashboard) and their department. */
export type RoleType = 'teacher' | 'manager:operations' | 'manager:hr' | 'manager:finance';
export const ROLE_TYPES: readonly RoleType[] = ['teacher', 'manager:operations', 'manager:hr', 'manager:finance'];

export function roleTypeOf(role: Pick<RoleRow, 'base_role' | 'base_department'>): RoleType {
  if (role.base_role === 'manager') return `manager:${role.base_department ?? 'operations'}` as RoleType;
  return 'teacher';
}

function splitType(type: RoleType): { baseRole: StaffBaseRole; department: RoleDepartment | null } {
  if (type === 'teacher') return { baseRole: 'teacher', department: null };
  return { baseRole: 'manager', department: type.split(':')[1] as RoleDepartment };
}

interface RoleEditorProps {
  /** null = a new role. */
  role: RoleRow | null;
  /** Where a new role is created; null = platform template (XO). */
  nurseryId: string | null;
  features: readonly FeatureRow[];
  /** Staff currently on this role. */
  usersCount: number;
  readOnly: boolean;
  onSaved: (roleId: string) => void;
  onDeleted: () => void;
  onCancelNew: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Loads the role's current permissions, then shows the form. Remount it (key) per role. */
export function RoleEditor(props: RoleEditorProps) {
  const grants = useRoleFeatures(props.role?.id ?? null);
  if (props.role && grants.isPending) {
    return (
      <div className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (props.role && grants.isError) return <LoadError />;
  return <RoleForm {...props} initialDraft={draftFromRows(grants.data ?? [])} />;
}

function LoadError() {
  const { t } = useTranslation();
  return (
    <p className="rounded-2xl border border-error/30 bg-error/5 p-5 text-sm text-error" role="alert">
      {t('rbac.errors.loadGrants')}
    </p>
  );
}

function RoleForm({
  role,
  nurseryId,
  features,
  usersCount,
  readOnly,
  onSaved,
  onDeleted,
  onCancelNew,
  onDirtyChange,
  initialDraft,
}: RoleEditorProps & { initialDraft: GrantDraft }) {
  const { t, i18n } = useTranslation();
  const saveRole = useSaveRole();
  const deleteRole = useDeleteRole();
  const busy = useRef(false);

  const isNew = role == null;
  const locked = Boolean(role && (role.is_system || role.is_seed));

  const [baseline, setBaseline] = useState(() => ({
    nameAr: role?.name_ar ?? '',
    nameEn: role?.name_en ?? '',
    type: role ? roleTypeOf(role) : ('teacher' as RoleType),
    draft: initialDraft,
  }));
  const [nameAr, setNameAr] = useState(baseline.nameAr);
  const [nameEn, setNameEn] = useState(baseline.nameEn);
  const [type, setType] = useState<RoleType>(baseline.type);
  const [draft, setDraft] = useState<GrantDraft>(baseline.draft);
  const [showErrors, setShowErrors] = useState(false);

  const nameMissing = !nameAr.trim() && !nameEn.trim();
  const dirty =
    isNew ||
    nameAr !== baseline.nameAr ||
    nameEn !== baseline.nameEn ||
    type !== baseline.type ||
    !sameDraft(draft, baseline.draft);

  useEffect(() => {
    onDirtyChange(dirty && !readOnly);
  }, [dirty, readOnly, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const discard = () => {
    if (isNew) {
      onCancelNew();
      return;
    }
    setNameAr(baseline.nameAr);
    setNameEn(baseline.nameEn);
    setType(baseline.type);
    setDraft(baseline.draft);
    setShowErrors(false);
  };

  const save = async () => {
    if (busy.current || readOnly) return;
    if (nameMissing) {
      setShowErrors(true);
      return;
    }
    // Changing the type moves the role's people to the other app, so say so first.
    if (!isNew && type !== baseline.type && usersCount > 0) {
      const ok = await confirm({
        title: t('rbac.editor.typeChangeTitle'),
        description: t('rbac.editor.typeChangeBody', { count: usersCount }),
        confirmText: t('rbac.editor.save'),
      });
      if (!ok) return;
    }
    busy.current = true;
    try {
      const { baseRole, department } = splitType(type);
      const id = await saveRole.mutateAsync({
        roleId: role?.id ?? null,
        nurseryId,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim(),
        baseRole,
        department,
        grants: draftToGrants(draft),
      });
      setBaseline({ nameAr, nameEn, type, draft });
      toast.success(isNew ? t('rbac.toast.created') : t('rbac.toast.saved'));
      onSaved(id);
    } catch (error) {
      toast.error(t(rbacErrorKey(error)));
    } finally {
      busy.current = false;
    }
  };

  const remove = async () => {
    if (!role || busy.current) return;
    const ok = await confirm({
      title: t('rbac.editor.deleteTitle'),
      description: t('rbac.editor.deleteBody', { name: roleLabel(role, i18n.language, t) }),
      variant: 'danger',
    });
    if (!ok) return;
    busy.current = true;
    try {
      await deleteRole.mutateAsync(role.id);
      toast.success(t('rbac.toast.deleted'));
      onDeleted();
    } catch (error) {
      toast.error(t(rbacErrorKey(error)));
    } finally {
      busy.current = false;
    }
  };

  const pending = saveRole.isPending || deleteRole.isPending;
  const nameError = showErrors && nameMissing ? t('rbac.editor.nameRequired') : null;

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">
              {isNew ? t('rbac.editor.newTitle') : roleLabel(role, i18n.language, t)}
            </h2>
            <p className="text-sm text-foreground-secondary">
              {isNew
                ? t('rbac.editor.newHint')
                : t('rbac.editor.usersOnRole', { count: usersCount })}
            </p>
          </div>
          {locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-high px-2.5 py-1 text-xs text-foreground-secondary">
              <span className="material-symbols-outlined text-sm" aria-hidden>lock</span>
              {t('rbac.editor.systemBadge')}
            </span>
          ) : null}
        </div>

        {locked ? (
          <p className="rounded-xl bg-surface-low px-3 py-2 text-xs text-foreground-secondary">{t('rbac.editor.systemHint')}</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-name-ar">{t('rbac.editor.nameAr')}</Label>
            <Input
              id="role-name-ar"
              dir="rtl"
              value={nameAr}
              disabled={readOnly}
              onChange={(e) => setNameAr(e.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'role-name-error' : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-name-en">{t('rbac.editor.nameEn')}</Label>
            <Input
              id="role-name-en"
              dir="ltr"
              value={nameEn}
              disabled={readOnly}
              onChange={(e) => setNameEn(e.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'role-name-error' : undefined}
            />
          </div>
          {nameError ? (
            <p id="role-name-error" className="-mt-2 text-xs text-error sm:col-span-2">
              {nameError}
            </p>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="role-type">{t('rbac.editor.type')}</Label>
            <Select
              id="role-type"
              value={type}
              disabled={readOnly || locked}
              onChange={(e) => setType(e.target.value as RoleType)}
              aria-describedby="role-type-hint"
            >
              {ROLE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`rbac.types.${value.replace(':', '_')}`)}
                </option>
              ))}
            </Select>
            <p id="role-type-hint" className="text-xs text-foreground-tertiary">
              {t('rbac.editor.typeHint')}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t('rbac.editor.permissions')}</h3>
          <p className="text-sm text-foreground-secondary">{t('rbac.editor.permissionsHint')}</p>
        </div>
        <PermissionGrid features={features} draft={draft} onChange={setDraft} readOnly={readOnly} />
      </section>

      {!readOnly ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant bg-surface/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            {dirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                <span className="text-foreground">{t('rbac.editor.unsaved')}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base text-success" aria-hidden>check_circle</span>
                <span className="text-foreground-secondary">{t('rbac.editor.allSaved')}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && !locked ? (
              <Button
                type="button"
                variant="ghost"
                className="text-error hover:bg-error/10"
                disabled={pending || usersCount > 0}
                title={usersCount > 0 ? t('rbac.errors.rbac_role_in_use') : undefined}
                onClick={() => void remove()}
              >
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>delete</span>
                {t('rbac.editor.delete')}
              </Button>
            ) : null}
            {dirty ? (
              <Button type="button" variant="outline" disabled={pending} onClick={discard}>
                {isNew ? t('common.cancel') : t('rbac.editor.discard')}
              </Button>
            ) : null}
            <Button type="button" disabled={pending || !dirty} onClick={() => void save()}>
              {saveRole.isPending ? t('rbac.editor.saving') : isNew ? t('rbac.editor.create') : t('rbac.editor.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
