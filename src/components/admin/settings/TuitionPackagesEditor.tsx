import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { IconAction, TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
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
import { applyDealToPrice, isDealCurrentlyActive, useAdminDeals, useInlineDealCleanup } from '@/hooks/useAdminDeals';
import { useNurserySettings } from '@/hooks/useNurserySettings';
import { usePagination } from '@/hooks/usePagination';
import { useTouchedFields } from '@/hooks/useTouchedFields';
import { formatTime } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { hasIssues, tuitionPackageFormIssues } from '@/lib/packageForms';
import { cn, formatQueryError } from '@/lib/utils';
import { AdminPackageCard } from './AdminPackageCard';
import { BulkTuitionAssignDialog } from './BulkTuitionAssignDialog';
import { dealDiscountLabel, localizedName } from './dealLabels';
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

type PackageField = 'name' | 'price' | 'periods';

function blankFeature(): TuitionFeature {
  return { ar: '', en: '' };
}

/** 'HH:MM[:SS]' as a clock time in the current language, e.g. "08:00 AM" / "٠٨:٠٠ ص". */
function clockLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return formatTime(new Date(2000, 0, 1, h, m));
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

export function TuitionPackagesEditor({
  nurseryId,
  assignOpen,
  onAssignOpenChange,
}: {
  nurseryId?: string | null;
  /** Lets the page open the "assign to children" dialog too (e.g. from a stat tile). */
  assignOpen?: boolean;
  onAssignOpenChange?: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const { query, create, update } = useAdminTuitionPackages(nurseryId);
  const { query: dealsQuery } = useAdminDeals(nurseryId);
  const dealCleanup = useInlineDealCleanup(nurseryId);
  const { settings: nurserySettings, isLoading: nurserySettingsLoading } = useNurserySettings(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // A new package already created by a save whose billing periods then failed: saving again
  // updates it instead of creating a second package.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [form, setForm] = useState<TuitionPackageInput>(EMPTY_FORM);
  const [periodRows, setPeriodRows] = useState<Record<BillingPeriodKind, BillingPeriodRowState> | null>(null);
  const fields = useTouchedFields<PackageField>();
  const { query: periodsQuery, upsert: upsertPeriod } = useAdminTuitionBillingPeriods(editingId);

  const [ownBulkOpen, setOwnBulkOpen] = useState(false);
  const bulkOpen = assignOpen ?? ownBulkOpen;
  const setBulkOpen = onAssignOpenChange ?? setOwnBulkOpen;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dealFilter, setDealFilter] = useState<'all' | 'with' | 'without'>('all');

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const busy = create.isPending || update.isPending || upsertPeriod.isPending;
  const issues = tuitionPackageFormIssues(form, periodRows ? Object.values(periodRows) : null);
  const errorFor = (field: PackageField) => {
    const issue = issues[field];
    return fields.isShown(field) && issue ? t(`packageForms.errors.${issue}`) : null;
  };

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

  const pager = usePagination(filteredRows, 9, `${search}|${statusFilter}|${dealFilter}`);
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
  const startLabel = clockLabel(nurserySettings?.standard_start_time);
  const endLabel = clockLabel(nurserySettings?.standard_end_time);
  const hoursRangeLabel = startLabel && endLabel ? `${startLabel} – ${endLabel}` : null;
  const computedDailyHours = computeHoursSpan(nurserySettings?.standard_start_time, nurserySettings?.standard_end_time);

  const openCreate = () => {
    setEditingId(null);
    setCreatedId(null);
    fields.reset();
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
    setCreatedId(null);
    fields.reset();
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

  /** Closing without saving drops any custom discount made in this editor. */
  const closeDialog = () => {
    void dealCleanup.discard(null);
    setDialogOpen(false);
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
    if (!nurseryId) return;
    if (hasIssues(issues)) {
      fields.showAll();
      return;
    }
    const payload: TuitionPackageInput = withCurrentDailyHours({
      ...form,
      features_json: form.features_json.filter((feature) => feature.ar.trim() || feature.en.trim()),
    });
    try {
      let packageId = editingId ?? createdId;
      if (packageId) {
        await update.mutateAsync({ id: packageId, input: payload });
      } else {
        packageId = (await create.mutateAsync(payload)).id;
        setCreatedId(packageId);
      }

      // Save the package and its billing periods together in one Save click — periods were
      // only ever local state until now, whether this package is brand new or pre-existing.
      if (periodRows) {
        await Promise.all(
          Object.values(periodRows).map((row) =>
            upsertPeriod.mutateAsync({
              tuitionPackageId: packageId,
              nurseryId,
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

      void dealCleanup.discard(payload.deal_id);
      toast.success(t('tuitionPackages.saved'));
      setDialogOpen(false);
    } catch (error) {
      toast.error(t('tuitionPackages.saveFailed'), { description: formatQueryError(error) });
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
      toast.success(pkg.active ? t('packages.deactivated') : t('packages.activated'));
    } catch (error) {
      toast.error(t('tuitionPackages.updateFailed'), { description: formatQueryError(error) });
    }
  };

  if (!nurseryId) return null;

  const nameError = errorFor('name');
  const priceError = errorFor('price');
  const periodsError = errorFor('periods');

  const newPackageButton = (
    <Button type="button" onClick={openCreate}>
      <MaterialSymbol name="add" size="text-base" />
      {t('tuitionPackages.newPackage')}
    </Button>
  );

  return (
    <>
      <TableCard
        title={t('tuitionPackages.title')}
        description={t('tuitionPackages.subtitle')}
        count={rows.length ? t('packages.overview.count', { count: filteredRows.length }) : undefined}
        actions={
          <>
            {rows.some((pkg) => pkg.active) ? (
              <Button type="button" variant="outline" onClick={() => setBulkOpen(true)}>
                <MaterialSymbol name="group_add" size="text-base" />
                {t('tuitionPackages.assignToChildren')}
              </Button>
            ) : null}
            {newPackageButton}
          </>
        }
        filters={
          rows.length ? (
            <FilterBar onClear={clearFilters} canClear={hasActiveFilters}>
              <FilterField label={t('packageFilters.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('packageFilters.searchPlaceholder')} />
              </FilterField>
              <FilterField label={t('packageFilters.status')}>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="all">{t('packageFilters.allStatuses')}</option>
                  <option value="active">{t('packageFilters.active')}</option>
                  <option value="inactive">{t('packageFilters.inactive')}</option>
                </Select>
              </FilterField>
              <FilterField label={t('packageFilters.discount')}>
                <Select value={dealFilter} onChange={(e) => setDealFilter(e.target.value as typeof dealFilter)}>
                  <option value="all">{t('packageFilters.allPackages')}</option>
                  <option value="with">{t('packageFilters.withDiscount')}</option>
                  <option value="without">{t('packageFilters.withoutDiscount')}</option>
                </Select>
              </FilterField>
            </FilterBar>
          ) : null
        }
        pagination={filteredRows.length ? <TablePagination pager={pager} pageSizeOptions={[9, 18, 36]} /> : null}
      >
        {query.isLoading ? (
          <TableLoading />
        ) : rows.length === 0 ? (
          <TableEmpty
            icon="payments"
            title={t('tuitionPackages.emptyTitle')}
            description={t('tuitionPackages.emptyDescription')}
            action={newPackageButton}
          />
        ) : filteredRows.length === 0 ? (
          <TableEmpty
            icon="filter_alt_off"
            title={t('packageFilters.noMatch')}
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                {t('packageFilters.clear')}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {pager.pageItems.map((pkg) => {
              const deal = (dealsQuery.data ?? []).find((d) => d.id === pkg.deal_id);
              const live = deal ? isDealCurrentlyActive(deal) : false;
              const dealLabel = deal ? `${localizedName(deal, isAr)} · ${dealDiscountLabel(t, deal)}` : '';
              return (
                <AdminPackageCard
                  key={pkg.id}
                  icon="school"
                  name={localizedName(pkg, isAr)}
                  active={pkg.active}
                  price={money(pkg.price)}
                  discountedPrice={deal && live ? money(applyDealToPrice(pkg.price, deal)) : null}
                  priceSuffix={t('applications.paymentPackage.perMonth')}
                  deal={deal ? { label: live ? dealLabel : t('deals.inactiveSuffix', { label: dealLabel }), live } : null}
                  description={isAr ? pkg.description_ar || pkg.description_en : pkg.description_en || pkg.description_ar}
                  features={pkg.features_json.map((feature) => (isAr ? feature.ar || feature.en : feature.en || feature.ar)).filter(Boolean)}
                  emptyHint={t('packageCard.noDetails')}
                  facts={[
                    ...(hoursRangeLabel ? [{ icon: 'schedule', label: hoursRangeLabel }] : []),
                    { icon: 'groups', label: t('packages.assignedCount', { count: pkg.subscribed_count }) },
                  ]}
                  actions={
                    <>
                      {/* The switch shows the package's state; clicking flips it. */}
                      <IconAction
                        icon={pkg.active ? 'toggle_on' : 'toggle_off'}
                        label={pkg.active ? t('packages.deactivate') : t('packages.activate')}
                        disabled={update.isPending}
                        onClick={() => void toggleActive(pkg)}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(pkg)}>
                        <MaterialSymbol name="edit" size="text-base" />
                        {t('common.edit')}
                      </Button>
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </TableCard>

      <BulkTuitionAssignDialog open={bulkOpen} onOpenChange={setBulkOpen} nurseryId={nurseryId} />

      <Dialog open={dialogOpen} onOpenChange={(open) => !busy && (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t('tuitionPackages.dialog.editTitle') : t('tuitionPackages.dialog.newTitle')}</DialogTitle>
            <DialogDescription>{t('tuitionPackages.dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
            <FormSection title={t('tuitionPackages.sections.name')} icon="badge">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tuition-name-en">{t('tuitionPackages.fields.nameEn')}</Label>
                  <Input
                    id="tuition-name-en"
                    value={form.name_en}
                    aria-invalid={Boolean(nameError)}
                    className={cn(nameError && invalidFieldClass)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tuition-name-ar">{t('tuitionPackages.fields.nameAr')}</Label>
                  <Input
                    id="tuition-name-ar"
                    dir="rtl"
                    value={form.name_ar}
                    aria-invalid={Boolean(nameError)}
                    className={cn(nameError && invalidFieldClass)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                  />
                </div>
              </div>
              <FieldError message={nameError} />
            </FormSection>

            <FormSection title={t('tuitionPackages.sections.pricing')} icon="payments">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tuition-price">{t('tuitionPackages.fields.price')}</Label>
                  <Input
                    id="tuition-price"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price}
                    aria-invalid={Boolean(priceError)}
                    className={cn(priceError && invalidFieldClass)}
                    onBlur={() => fields.touch('price')}
                    onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
                  />
                  <FieldError message={priceError} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tuitionPackages.fields.dailyHours')}</Label>
                  {nurserySettingsLoading ? (
                    <Skeleton className="h-12 w-full rounded-lg" />
                  ) : hoursRangeLabel && computedDailyHours ? (
                    <div className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface-variant">
                      <MaterialSymbol name="schedule" size="text-base" className="shrink-0" />
                      {t('tuitionPackages.fields.hoursValue', { range: hoursRangeLabel, hours: computedDailyHours })}
                    </div>
                  ) : (
                    <p className="flex h-12 items-center rounded-lg border border-dashed border-error/40 px-3 text-xs text-error">
                      {t('tuitionPackages.fields.hoursMissing')}
                    </p>
                  )}
                  <p className="text-xs text-on-surface-variant">{t('tuitionPackages.fields.hoursHint')}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 border-t border-outline-variant pt-3 text-sm text-on-surface">
                <Checkbox checked={form.active} onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))} />
                {t('tuitionPackages.fields.active')}
              </label>
            </FormSection>

            <FormSection title={t('tuitionPackages.sections.deal')} description={t('tuitionPackages.sections.dealHint')} icon="sell">
              <PackageDealPicker
                nurseryId={nurseryId}
                dealId={form.deal_id}
                onChange={(deal_id) => setForm((f) => ({ ...f, deal_id }))}
                onCustomDealCreated={dealCleanup.track}
              />
            </FormSection>

            <FormSection title={t('tuitionPackages.sections.periods')} icon="event_repeat">
              {periodRows ? (
                <>
                  <TuitionPackageBillingPeriodsEditor
                    rows={periodRows}
                    onChange={setPeriodRows}
                    basePrice={form.price}
                    onBlur={() => fields.touch('periods')}
                  />
                  <FieldError message={periodsError} />
                </>
              ) : (
                <Skeleton className="h-40 w-full rounded-lg" />
              )}
            </FormSection>

            <FormSection title={t('tuitionPackages.sections.features')} icon="checklist">
              <div className="flex items-center justify-end">
                <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                  <MaterialSymbol name="add" size="text-base" />
                  {t('tuitionPackages.fields.addFeature')}
                </Button>
              </div>
              {form.features_json.length === 0 ? (
                <p className="rounded-lg border border-dashed border-outline-variant p-3 text-center text-xs text-on-surface-variant">
                  {t('tuitionPackages.fields.noFeatures')}
                </p>
              ) : (
                <div className="space-y-2">
                  {form.features_json.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder={t('tuitionPackages.fields.featureEn')}
                        aria-label={t('tuitionPackages.fields.featureEn')}
                        value={feature.en}
                        onChange={(e) => updateFeature(index, { en: e.target.value })}
                      />
                      <Input
                        dir="rtl"
                        placeholder={t('tuitionPackages.fields.featureAr')}
                        aria-label={t('tuitionPackages.fields.featureAr')}
                        value={feature.ar}
                        onChange={(e) => updateFeature(index, { ar: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-error"
                        aria-label={t('tuitionPackages.fields.removeFeature')}
                        onClick={() => removeFeature(index)}
                      >
                        <MaterialSymbol name="delete" size="text-base" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title={t('tuitionPackages.sections.description')} icon="description">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tuition-desc-en">{t('tuitionPackages.fields.descEn')}</Label>
                  <Textarea
                    id="tuition-desc-en"
                    className="min-h-16"
                    value={form.description_en ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value || null }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tuition-desc-ar">{t('tuitionPackages.fields.descAr')}</Label>
                  <Textarea
                    id="tuition-desc-ar"
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
            <Button type="button" variant="outline" onClick={closeDialog} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
