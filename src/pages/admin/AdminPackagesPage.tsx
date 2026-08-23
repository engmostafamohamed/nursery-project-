import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  useAdminPackages,
  usePackageAssignments,
  type CoverageType,
  type PackageInput,
  type PackageRow,
} from '@/hooks/useAdminPackages';

const EMPTY_FORM: PackageInput = {
  name_ar: '',
  name_en: '',
  description_ar: null,
  description_en: null,
  coverage_type: 'unlimited',
  included_hours: null,
  price: 0,
  active: true,
};

function ManageChildrenDialog({
  pkg,
  nurseryId,
  onClose,
}: {
  pkg: PackageRow;
  nurseryId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { query, assign, unassign } = usePackageAssignments(pkg.id, nurseryId);
  const { data: children = [] } = useNurseryChildrenPicker(nurseryId);
  const [pick, setPick] = useState('');

  const assigned = query.data ?? [];
  const assignedIds = new Set(assigned.map((a) => a.child_id));
  const available = children.filter((c) => !assignedIds.has(c.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('packages.manageChildrenTitle', {
              name: isAr ? pkg.name_ar || pkg.name_en : pkg.name_en || pkg.name_ar,
            })}
          </DialogTitle>
          <DialogDescription>{t('packages.manageChildrenHint')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t('packages.selectChild')}</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {isAr ? c.full_name_ar || c.full_name_en : c.full_name_en || c.full_name_ar}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!pick || assign.isPending}
            onClick={async () => {
              try {
                await assign.mutateAsync(pick);
                setPick('');
                toast.success(t('packages.childAssigned'));
              } catch {
                toast.error(t('packages.saveFailed'));
              }
            }}
          >
            {t('packages.assign')}
          </Button>
        </div>

        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {query.isPending ? (
            <LoadingSkeleton />
          ) : assigned.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">
              {t('packages.noChildren')}
            </p>
          ) : (
            assigned.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-on-surface">
                    {isAr ? a.childNameAr || a.childNameEn : a.childNameEn || a.childNameAr}
                  </p>
                  {pkg.coverage_type === 'hours_quota' ? (
                    <p className="text-xs text-on-surface-variant">
                      {t('packages.hoursUsed', {
                        used: a.hours_used,
                        total: pkg.included_hours ?? 0,
                      })}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={unassign.isPending}
                  onClick={async () => {
                    try {
                      await unassign.mutateAsync(a.id);
                      toast.success(t('packages.childRemoved'));
                    } catch {
                      toast.error(t('packages.saveFailed'));
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="mt-5">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminPackagesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const { query, create, update, remove } = useAdminPackages(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageInput>(EMPTY_FORM);
  const [managePkg, setManagePkg] = useState<PackageRow | null>(null);

  const rows = query.data ?? [];
  const busy = create.isPending || update.isPending;

  const name = useMemo(
    () => (p: PackageRow) => (isAr ? p.name_ar || p.name_en : p.name_en || p.name_ar),
    [isAr],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: PackageRow) => {
    setEditingId(p.id);
    setForm({
      name_ar: p.name_ar,
      name_en: p.name_en,
      description_ar: p.description_ar,
      description_en: p.description_en,
      coverage_type: p.coverage_type,
      included_hours: p.included_hours,
      price: p.price,
      active: p.active,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name_ar.trim() && !form.name_en.trim()) {
      toast.error(t('packages.errorNoName'));
      return;
    }
    if (form.coverage_type === 'hours_quota' && (!form.included_hours || form.included_hours <= 0)) {
      toast.error(t('packages.errorNoHours'));
      return;
    }
    const payload: PackageInput = {
      ...form,
      included_hours: form.coverage_type === 'hours_quota' ? form.included_hours : null,
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input: payload });
      else await create.mutateAsync(payload);
      toast.success(t('packages.saved'));
      setDialogOpen(false);
    } catch {
      toast.error(t('packages.saveFailed'));
    }
  };

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{t('packages.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{t('packages.subtitle')}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>
            add
          </span>
          {t('packages.addButton')}
        </Button>
      </header>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="package_2"
          title={t('packages.emptyTitle')}
          description={t('packages.emptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">{name(p)}</p>
                  <span
                    className={
                      'rounded-full border px-2 py-0.5 text-xs font-medium ' +
                      (p.active
                        ? 'border-success/30 bg-success/10 text-success'
                        : 'border-outline-variant bg-surface-container text-on-surface-variant')
                    }
                  >
                    {p.active ? t('packages.active') : t('packages.inactive')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {p.coverage_type === 'unlimited'
                    ? t('packages.typeUnlimited')
                    : t('packages.typeQuota', { hours: p.included_hours ?? 0 })}
                  {' · '}
                  {t('packages.priceLabel', { price: p.price })}
                  {' · '}
                  {t('packages.assignedCount', { count: p.assigned_count })}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setManagePkg(p)}>
                  {t('packages.manageChildren')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(p)}>
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={async () => {
                    try {
                      await remove.mutateAsync(p.id);
                      toast.success(t('packages.deleted'));
                    } catch {
                      toast.error(t('packages.saveFailed'));
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !busy && setDialogOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('packages.editTitle') : t('packages.addTitle')}
            </DialogTitle>
            <DialogDescription>{t('packages.formHint')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('packages.fieldNameEn')}
                </span>
                <input
                  value={form.name_en}
                  onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('packages.fieldNameAr')}
                </span>
                <input
                  dir="rtl"
                  value={form.name_ar}
                  onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('packages.fieldType')}
                </span>
                <select
                  value={form.coverage_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, coverage_type: e.target.value as CoverageType }))
                  }
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="unlimited">{t('packages.optUnlimited')}</option>
                  <option value="hours_quota">{t('packages.optQuota')}</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('packages.fieldHours')}
                </span>
                <input
                  type="number"
                  min={0}
                  disabled={form.coverage_type !== 'hours_quota'}
                  value={form.included_hours ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      included_hours: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                  {t('packages.fieldPrice')}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
                  className="h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t('packages.fieldDescEn')}
              </span>
              <textarea
                value={form.description_en ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description_en: e.target.value || null }))
                }
                className="min-h-[60px] w-full rounded-xl border border-outline-variant bg-surface p-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                {t('packages.fieldDescAr')}
              </span>
              <textarea
                dir="rtl"
                value={form.description_ar ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description_ar: e.target.value || null }))
                }
                className="min-h-[60px] w-full rounded-xl border border-outline-variant bg-surface p-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              {t('packages.fieldActive')}
            </label>
          </div>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {managePkg && nurseryId ? (
        <ManageChildrenDialog
          pkg={managePkg}
          nurseryId={nurseryId}
          onClose={() => setManagePkg(null)}
        />
      ) : null}
    </div>
  );
}
