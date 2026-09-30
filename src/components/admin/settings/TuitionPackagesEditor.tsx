import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { confirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAdminTuitionPackages,
  type TuitionFeature,
  type TuitionPackageInput,
  type TuitionPackageRow,
} from '@/hooks/useAdminTuitionPackages';

const EMPTY_FORM: TuitionPackageInput = {
  name_ar: '',
  name_en: '',
  description_ar: null,
  description_en: null,
  daily_hours: null,
  features_json: [],
  price: 0,
  active: true,
};

function blankFeature(): TuitionFeature {
  return { ar: '', en: '' };
}

export function TuitionPackagesEditor({ nurseryId }: { nurseryId?: string | null }) {
  const { query, create, update, remove } = useAdminTuitionPackages(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TuitionPackageInput>(EMPTY_FORM);

  const rows = query.data ?? [];
  const busy = create.isPending || update.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (pkg: TuitionPackageRow) => {
    setEditingId(pkg.id);
    setForm({
      name_ar: pkg.name_ar,
      name_en: pkg.name_en,
      description_ar: pkg.description_ar,
      description_en: pkg.description_en,
      daily_hours: pkg.daily_hours,
      features_json: pkg.features_json,
      price: pkg.price,
      active: pkg.active,
    });
    setDialogOpen(true);
  };

  const updateFeature = (index: number, patch: Partial<TuitionFeature>) => {
    setForm((f) => ({
      ...f,
      features_json: f.features_json.map((feature, i) => (i === index ? { ...feature, ...patch } : feature)),
    }));
  };

  const addFeature = () => setForm((f) => ({ ...f, features_json: [...f.features_json, blankFeature()] }));
  const removeFeature = (index: number) =>
    setForm((f) => ({ ...f, features_json: f.features_json.filter((_, i) => i !== index) }));

  const submit = async () => {
    if (!form.name_ar.trim() && !form.name_en.trim()) {
      toast.error('Please enter a package name.');
      return;
    }
    const payload: TuitionPackageInput = {
      ...form,
      features_json: form.features_json.filter((feature) => feature.ar.trim() || feature.en.trim()),
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input: payload });
      else await create.mutateAsync(payload);
      toast.success('Tuition package saved.');
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the package.');
    }
  };

  const handleDelete = async (pkg: TuitionPackageRow) => {
    const ok = await confirm({
      title: 'Delete this tuition package?',
      description: `"${pkg.name_en || pkg.name_ar}" will be permanently removed. This can't be undone.`,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(pkg.id);
      toast.success('Tuition package deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the package.');
    }
  };

  if (!nurseryId) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-on-surface">Tuition packages</h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            The nursery's own cost plans — daily hours covered, included features, and price. Parents choose one of
            these during registration.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <MaterialSymbol name="add" size="text-base" />
          New package
        </Button>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="payments"
          title="No tuition packages yet"
          description="Create one to give parents a cost plan to choose from during registration."
          action={
            <Button type="button" onClick={openCreate}>
              <MaterialSymbol name="add" size="text-base" />
              New package
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((pkg) => (
            <div
              key={pkg.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-outline-variant bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-on-surface">{pkg.name_en || pkg.name_ar}</span>
                  <Badge variant={pkg.active ? 'success' : 'secondary'}>{pkg.active ? 'Active' : 'Inactive'}</Badge>
                  {pkg.daily_hours ? (
                    <Badge variant="outline">
                      <MaterialSymbol name="schedule" size="text-xs" className="me-1" />
                      {pkg.daily_hours} hrs/day
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium text-on-surface">EGP {pkg.price.toFixed(2)}</p>
                {pkg.features_json.length ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {pkg.features_json.map((feature, index) => (
                      <li key={index} className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                        <MaterialSymbol name="check_small" size="text-sm" className="mt-0.5 shrink-0" />
                        <span>{feature.en || feature.ar}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(pkg)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-error hover:bg-error/10"
                  disabled={remove.isPending}
                  onClick={() => void handleDelete(pkg)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !busy && setDialogOpen(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit tuition package' : 'New tuition package'}</DialogTitle>
            <DialogDescription>Set the cost, daily hours covered, and what's included.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name (English)</Label>
                <Input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Name (Arabic)</Label>
                <Input
                  dir="rtl"
                  value={form.name_ar}
                  onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Price (EGP)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Daily hours covered</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="e.g. 8"
                  value={form.daily_hours ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, daily_hours: e.target.value ? Number(e.target.value) : null }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Features</Label>
                <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                  <MaterialSymbol name="add" size="text-base" />
                  Add feature
                </Button>
              </div>
              {form.features_json.length === 0 ? (
                <p className="rounded-lg border border-dashed border-outline-variant p-3 text-center text-xs text-on-surface-variant">
                  No features added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.features_json.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Feature (English)"
                        value={feature.en}
                        onChange={(e) => updateFeature(index, { en: e.target.value })}
                      />
                      <Input
                        dir="rtl"
                        placeholder="الميزة (عربي)"
                        value={feature.ar}
                        onChange={(e) => updateFeature(index, { ar: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-error"
                        onClick={() => removeFeature(index)}
                      >
                        <MaterialSymbol name="delete" size="text-base" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Description (English)</Label>
                <Textarea
                  className="min-h-16"
                  value={form.description_en ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description (Arabic)</Label>
                <Textarea
                  dir="rtl"
                  className="min-h-16"
                  value={form.description_ar ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, description_ar: e.target.value || null }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-on-surface">
              <Checkbox
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))}
              />
              Active (visible to parents)
            </label>
          </div>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
