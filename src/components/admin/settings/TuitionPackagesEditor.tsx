import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { FilterMenu } from '@/components/ui/FilterMenu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAdminTuitionPackages,
  type TuitionFeature,
  type TuitionPackageInput,
  type TuitionPackageRow,
} from '@/hooks/useAdminTuitionPackages';
import {
  billingPeriodRowsFromExisting,
  resyncUntouchedBillingPeriods,
  useAdminTuitionBillingPeriods,
  type BillingPeriodKind,
  type BillingPeriodRowState,
} from '@/hooks/useAdminTuitionBillingPeriods';
import { applyDealToPrice, isDealCurrentlyActive, useAdminDeals } from '@/hooks/useAdminDeals';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { formatQueryError } from '@/lib/utils';
import { FormSection } from './FormSection';
import { PackageDealPicker } from './PackageDealPicker';
import { TuitionPackageBillingPeriodsEditor } from './TuitionPackageBillingPeriodsEditor';

const EMPTY_FORM: TuitionPackageInput = {
  name_ar: '',
  name_en: '',
  description_ar: null,
  description_en: null,
  daily_hours: null,
  features_json: [],
  price: 0,
  active: true,
  deal_id: null,
};

function blankFeature(): TuitionFeature {
  return { ar: '', en: '' };
}

function formatTime12h(time: string | null | undefined): string | null {
  if (!time) return null;
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Hours between two 'HH:MM[:SS]' times, rounded to 1 decimal to match the daily_hours column. */
function computeHoursSpan(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return null;
  const minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 10) / 10;
}

export function TuitionPackagesEditor({ nurseryId }: { nurseryId?: string | null }) {
  const { query, create, update } = useAdminTuitionPackages(nurseryId);
  const { query: dealsQuery } = useAdminDeals(nurseryId);
  const { settings: nurserySettings, isLoading: nurserySettingsLoading } = useNurserySettings(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TuitionPackageInput>(EMPTY_FORM);
  const [periodRows, setPeriodRows] = useState<Record<BillingPeriodKind, BillingPeriodRowState> | null>(null);
  const { query: periodsQuery, upsert: upsertPeriod } = useAdminTuitionBillingPeriods(editingId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dealFilter, setDealFilter] = useState<'all' | 'with' | 'without'>('all');

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const busy = create.isPending || update.isPending || upsertPeriod.isPending;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((pkg) => {
      if (statusFilter === 'active' && !pkg.active) return false;
      if (statusFilter === 'inactive' && pkg.active) return false;
      if (dealFilter === 'with' && !pkg.deal_id) return false;
      if (dealFilter === 'without' && pkg.deal_id) return false;
      if (q && !`${pkg.name_en} ${pkg.name_ar}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, dealFilter]);

  const hasActiveFilters = Boolean(search || statusFilter !== 'all' || dealFilter !== 'all');
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setDealFilter('all');
  };

  // Load the existing periods once editing an existing package (openCreate sets periodRows
  // directly and synchronously, so this only matters for edit).
  useEffect(() => {
    if (!dialogOpen || !editingId || periodsQuery.isLoading) return;
    setPeriodRows(billingPeriodRowsFromExisting(periodsQuery.data ?? [], form.price));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, editingId, periodsQuery.data, periodsQuery.isLoading]);

  // Keep untouched periods' prices tracking the package's own price field live.
  useEffect(() => {
    setPeriodRows((prev) => (prev ? resyncUntouchedBillingPeriods(prev, form.price) : prev));
  }, [form.price]);

  // Daily hours is never typed by hand — it always matches the nursery's own opening/closing
  // times from Settings → Operations, for every package, since a package can't cover more
  // hours than the nursery is actually open.
  const startLabel = formatTime12h(nurserySettings?.standard_start_time);
  const endLabel = formatTime12h(nurserySettings?.standard_end_time);
  const hoursRangeLabel = startLabel && endLabel ? `${startLabel} – ${endLabel}` : null;
  const computedDailyHours = computeHoursSpan(nurserySettings?.standard_start_time, nurserySettings?.standard_end_time);

  const openCreate = () => {
    setEditingId(null);
    // Pre-fill from the nursery's own Financial rate instead of starting at 0 — still fully
    // editable, since different packages can legitimately have different prices.
    const defaultPrice = Number(nurserySettings?.monthly_rate ?? 0) || 0;
    setForm({ ...EMPTY_FORM, price: defaultPrice });
    // No package exists yet, so there's nothing saved to load — these are pure local defaults
    // (multiples of defaultPrice) until Save creates both the package and its periods together.
    setPeriodRows(billingPeriodRowsFromExisting([], defaultPrice));
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
      deal_id: pkg.deal_id,
    });
    setPeriodRows(null); // shows a loading state until this package's saved periods arrive
    setDialogOpen(true);
  };

  /** Re-synced to the nursery's current operating hours on every save — see computedDailyHours. */
  const withCurrentDailyHours = (input: TuitionPackageInput): TuitionPackageInput => ({
    ...input,
    daily_hours: computedDailyHours ?? input.daily_hours,
  });

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
    if (!nurseryId) return;
    const payload: TuitionPackageInput = withCurrentDailyHours({
      ...form,
      features_json: form.features_json.filter((feature) => feature.ar.trim() || feature.en.trim()),
    });
    try {
      const packageId = editingId ?? (await create.mutateAsync(payload)).id;
      if (editingId) await update.mutateAsync({ id: editingId, input: payload });

      // Save the package and its billing periods together in one Save click — periods were
      // only ever local state until now, whether this package is brand new or pre-existing.
      if (periodRows) {
        await Promise.all(
          Object.values(periodRows).map((row) =>
            upsertPeriod.mutateAsync({
              tuitionPackageId: packageId,
              nurseryId,
              id: row.id,
              input: {
                billing_period: row.billing_period,
                duration_months: row.duration_months,
                price: row.price,
                active: row.active,
              },
            }),
          ),
        );
      }

      toast.success('Tuition package saved.');
      setDialogOpen(false);
    } catch (error) {
      toast.error('Could not save the package.', { description: formatQueryError(error) });
    }
  };

  // Tuition packages are never deleted — once children are subscribed to one, removing it
  // would orphan their billing history. Deactivating just hides it from new pickers.
  const toggleActive = async (pkg: TuitionPackageRow) => {
    try {
      await update.mutateAsync({
        id: pkg.id,
        input: withCurrentDailyHours({
          name_ar: pkg.name_ar,
          name_en: pkg.name_en,
          description_ar: pkg.description_ar,
          description_en: pkg.description_en,
          daily_hours: pkg.daily_hours,
          features_json: pkg.features_json,
          price: pkg.price,
          active: !pkg.active,
          deal_id: pkg.deal_id,
        }),
      });
      toast.success(pkg.active ? 'Package deactivated.' : 'Package activated.');
    } catch (error) {
      toast.error('Could not update the package.', { description: formatQueryError(error) });
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
        <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
          <div className="min-w-[180px] flex-1 space-y-1">
            <Label className="text-xs font-semibold text-on-surface-variant">Search</Label>
            <Input className="h-11" placeholder="Package name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterMenu<typeof statusFilter>
            className="w-48"
            label="Status"
            icon="toggle_on"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
          <FilterMenu<typeof dealFilter>
            className="w-52"
            label="Discount"
            icon="sell"
            value={dealFilter}
            onChange={setDealFilter}
            options={[
              { value: 'all', label: 'All packages' },
              { value: 'with', label: 'With a discount' },
              { value: 'without', label: 'Without a discount' },
            ]}
          />
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              <MaterialSymbol name="close" size="text-base" />
              Clear filters
            </Button>
          ) : null}
        </div>

        {filteredRows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
            No packages match these filters.
          </p>
        ) : (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">Package</th>
                  <th className="px-4 py-3 text-start font-semibold">Price</th>
                  <th className="px-4 py-3 text-start font-semibold">Hours</th>
                  <th className="px-4 py-3 text-start font-semibold">Children</th>
                  <th className="px-4 py-3 text-start font-semibold">Status</th>
                  <th className="px-4 py-3 text-end font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filteredRows.map((pkg) => {
                  const deal = (dealsQuery.data ?? []).find((d) => d.id === pkg.deal_id);
                  const live = deal ? isDealCurrentlyActive(deal) : false;
                  const discounted = deal ? applyDealToPrice(pkg.price, deal) : pkg.price;
                  return (
                    <tr key={pkg.id} className="bg-surface transition hover:bg-surface-container-lowest">
                      <td className="max-w-[260px] px-4 py-4 align-top">
                        <p className="truncate font-semibold text-on-surface">{pkg.name_en || pkg.name_ar}</p>
                        {pkg.features_json.length ? (
                          <ul className="mt-1 space-y-0.5">
                            {pkg.features_json.slice(0, 3).map((feature, index) => (
                              <li key={index} className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                                <MaterialSymbol name="check_small" size="text-sm" className="mt-0.5 shrink-0" />
                                <span className="truncate">{feature.en || feature.ar}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={live ? 'text-sm text-on-surface-variant line-through' : 'text-sm font-medium text-on-surface'}>
                            EGP {pkg.price.toFixed(2)}
                          </span>
                          {live ? <span className="text-sm font-semibold text-error">EGP {discounted.toFixed(2)}</span> : null}
                        </div>
                        {deal ? (
                          <Badge variant={live ? 'warning' : 'secondary'} className="mt-1">
                            <MaterialSymbol name="sell" size="text-xs" className="me-1" />
                            {deal.name_en || deal.name_ar}
                            {' · '}
                            {deal.discount_type === 'percentage' ? `${deal.discount_value}%` : `EGP ${deal.discount_value}`} off
                            {!live ? ' (inactive)' : ''}
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 align-top text-xs text-on-surface-variant">{hoursRangeLabel ?? '—'}</td>
                      <td className="px-4 py-4 align-top text-on-surface">
                        {pkg.subscribed_count} {pkg.subscribed_count === 1 ? 'child' : 'children'}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Badge variant={pkg.active ? 'success' : 'secondary'}>{pkg.active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(pkg)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={update.isPending}
                            onClick={() => void toggleActive(pkg)}
                          >
                            {pkg.active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !busy && setDialogOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit tuition package' : 'New tuition package'}</DialogTitle>
            <DialogDescription>Set the cost, daily hours covered, and what's included.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
            <FormSection title="Package name" icon="badge">
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
            </FormSection>

            <FormSection title="Pricing & hours" icon="payments">
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
                  {nurserySettingsLoading ? (
                    <Skeleton className="h-12 w-full rounded-lg" />
                  ) : hoursRangeLabel && computedDailyHours ? (
                    <div className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface-variant">
                      <MaterialSymbol name="schedule" size="text-base" className="shrink-0" />
                      {hoursRangeLabel} ({computedDailyHours} hrs/day)
                    </div>
                  ) : (
                    <p className="flex h-12 items-center rounded-lg border border-dashed border-error/40 px-3 text-xs text-error">
                      Set nursery opening/closing times in Settings → Operations first.
                    </p>
                  )}
                  <p className="text-xs text-on-surface-variant">
                    Matches the nursery's opening and closing times — set in Settings → Operations.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 border-t border-outline-variant pt-3 text-sm text-on-surface">
                <Checkbox
                  checked={form.active}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))}
                />
                Active (visible to parents)
              </label>
            </FormSection>

            <FormSection
              title="Deal / discount"
              description="Optional — assign an existing offer or create a one-off discount just for this package."
              icon="sell"
            >
              <PackageDealPicker
                nurseryId={nurseryId}
                dealId={form.deal_id}
                onChange={(deal_id) => setForm((f) => ({ ...f, deal_id }))}
              />
            </FormSection>

            <FormSection title="Billing periods" icon="event_repeat">
              {periodRows ? (
                <TuitionPackageBillingPeriodsEditor rows={periodRows} onChange={setPeriodRows} basePrice={form.price} />
              ) : (
                <Skeleton className="h-40 w-full rounded-lg" />
              )}
            </FormSection>

            <FormSection title="Features" icon="checklist">
              <div className="flex items-center justify-end">
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
            </FormSection>

            <FormSection title="Description" icon="description">
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
            </FormSection>
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
