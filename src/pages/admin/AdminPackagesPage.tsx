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
import { FilterMenu } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dealDiscountLabel, localizedName } from '@/components/admin/settings/dealLabels';
import { ExtraHoursHourlyRateCard } from '@/components/admin/settings/ExtraHoursHourlyRateCard';
import { FormSection } from '@/components/admin/settings/FormSection';
import { PackageDealPicker } from '@/components/admin/settings/PackageDealPicker';
import { TuitionPackagesEditor } from '@/components/admin/settings/TuitionPackagesEditor';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { useAdminDeals, isDealCurrentlyActive, applyDealToPrice, useInlineDealCleanup } from '@/hooks/useAdminDeals';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { useTouchedFields } from '@/hooks/useTouchedFields';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatMoneyAmount } from '@/lib/money';
import { extraHoursPackageFormIssues, hasIssues } from '@/lib/packageForms';
import { cn, formatQueryError } from '@/lib/utils';
import {
  useAdminPackages,
  usePackageAssignments,
  type CoverageType,
  type PackageInput,
  type PackageRow,
  type ValidityUnit,
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
  validity_value: null,
  validity_unit: null,
  deal_id: null,
};

type PackageField = 'name' | 'includedHours' | 'price' | 'validityValue' | 'validityUnit';

const inputClass = 'h-10 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-primary';

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

  const { query, create, update } = useAdminPackages(nurseryId);
  const { query: dealsQuery } = useAdminDeals(nurseryId);
  const dealCleanup = useInlineDealCleanup(nurseryId);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageInput>(EMPTY_FORM);
  const fields = useTouchedFields<PackageField>();
  const issues = extraHoursPackageFormIssues(form);
  const errorFor = (field: PackageField) => {
    const issue = issues[field];
    return fields.isShown(field) && issue ? t(`packageForms.errors.${issue}`) : null;
  };
  const [managePkg, setManagePkg] = useState<PackageRow | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | CoverageType>('all');
  const [dealFilter, setDealFilter] = useState<'all' | 'with' | 'without'>('all');

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter === 'active' && !p.active) return false;
      if (statusFilter === 'inactive' && p.active) return false;
      if (coverageFilter !== 'all' && p.coverage_type !== coverageFilter) return false;
      if (dealFilter === 'with' && !p.deal_id) return false;
      if (dealFilter === 'without' && p.deal_id) return false;
      if (q && !`${p.name_en} ${p.name_ar}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, coverageFilter, dealFilter]);

  const hasActiveFilters = Boolean(search || statusFilter !== 'all' || coverageFilter !== 'all' || dealFilter !== 'all');
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setCoverageFilter('all');
    setDealFilter('all');
  };
  const busy = create.isPending || update.isPending;

  const name = useMemo(
    () => (p: PackageRow) => (isAr ? p.name_ar || p.name_en : p.name_en || p.name_ar),
    [isAr],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    fields.reset();
    setDialogOpen(true);
  };

  /** Closing without saving drops any custom discount made in this editor. */
  const closeDialog = () => {
    void dealCleanup.discard(null);
    setDialogOpen(false);
  };

  const openEdit = (p: PackageRow) => {
    setEditingId(p.id);
    fields.reset();
    setForm({
      name_ar: p.name_ar,
      name_en: p.name_en,
      description_ar: p.description_ar,
      description_en: p.description_en,
      coverage_type: p.coverage_type,
      included_hours: p.included_hours,
      price: p.price,
      active: p.active,
      validity_value: p.validity_value,
      validity_unit: p.validity_unit,
      deal_id: p.deal_id,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (hasIssues(issues)) {
      fields.showAll();
      return;
    }
    const payload: PackageInput = {
      ...form,
      included_hours: form.coverage_type === 'hours_quota' ? form.included_hours : null,
      validity_value: form.validity_unit ? form.validity_value : null,
      validity_unit: form.validity_value ? form.validity_unit : null,
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input: payload });
      else await create.mutateAsync(payload);
      void dealCleanup.discard(payload.deal_id);
      toast.success(t('packages.saved'));
      setDialogOpen(false);
    } catch (error) {
      toast.error(t('packages.saveFailed'), { description: formatQueryError(error) });
    }
  };

  const toggleActive = async (p: PackageRow) => {
    try {
      await update.mutateAsync({
        id: p.id,
        input: {
          name_ar: p.name_ar,
          name_en: p.name_en,
          description_ar: p.description_ar,
          description_en: p.description_en,
          coverage_type: p.coverage_type,
          included_hours: p.included_hours,
          price: p.price,
          active: !p.active,
          validity_value: p.validity_value,
          validity_unit: p.validity_unit,
          deal_id: p.deal_id,
        },
      });
      toast.success(p.active ? t('packages.deactivated') : t('packages.activated'));
    } catch (error) {
      toast.error(t('packages.saveFailed'), { description: formatQueryError(error) });
    }
  };

  const nameError = errorFor('name');
  const hoursError = form.coverage_type === 'hours_quota' ? errorFor('includedHours') : null;
  const priceError = errorFor('price');
  const validityValueError = errorFor('validityValue');
  const validityUnitError = errorFor('validityUnit');

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-on-surface">{t('packages.pageTitle')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{t('packages.pageSubtitle')}</p>
      </div>

      <Tabs defaultValue="fixed">
        <TabsList>
          <TabsTrigger value="fixed">{t('packages.tabFixed')}</TabsTrigger>
          <TabsTrigger value="hours">{t('packages.tabHours')}</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed">
          <TuitionPackagesEditor nurseryId={nurseryId} />
        </TabsContent>

        <TabsContent value="hours" className="space-y-6">
          <ExtraHoursHourlyRateCard nurseryId={nurseryId} />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-on-surface">{t('packages.title')}</h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">{t('packages.subtitle')}</p>
            </div>
            <Button type="button" onClick={openCreate}>
              <MaterialSymbol name="add" size="text-base" />
              {t('packages.addButton')}
            </Button>
          </div>

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
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label className="text-xs font-semibold text-on-surface-variant">{t('packageFilters.search')}</Label>
                <Input
                  className="h-11"
                  placeholder={t('packageFilters.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <FilterMenu<typeof statusFilter>
                className="w-48"
                label={t('packageFilters.status')}
                icon="toggle_on"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: t('packageFilters.allStatuses') },
                  { value: 'active', label: t('packages.active') },
                  { value: 'inactive', label: t('packages.inactive') },
                ]}
              />
              <FilterMenu<typeof coverageFilter>
                className="w-52"
                label={t('packages.fieldType')}
                icon="schedule"
                value={coverageFilter}
                onChange={setCoverageFilter}
                options={[
                  { value: 'all', label: t('packageFilters.allTypes') },
                  { value: 'unlimited', label: t('packages.optUnlimited') },
                  { value: 'hours_quota', label: t('packages.optQuota') },
                ]}
              />
              <FilterMenu<typeof dealFilter>
                className="w-52"
                label={t('packageFilters.discount')}
                icon="sell"
                value={dealFilter}
                onChange={setDealFilter}
                options={[
                  { value: 'all', label: t('packageFilters.allPackages') },
                  { value: 'with', label: t('packageFilters.withDiscount') },
                  { value: 'without', label: t('packageFilters.withoutDiscount') },
                ]}
              />
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <MaterialSymbol name="close" size="text-base" />
                  {t('packageFilters.clear')}
                </Button>
              ) : null}
            </div>

            {filteredRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                {t('packageFilters.noMatch')}
              </p>
            ) : (
            <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">{t('tuitionPackages.columns.package')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('packages.fieldPrice')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('packages.fieldType')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('packages.columns.validity')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('packages.columns.assigned')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('packages.active')}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t('packages.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {filteredRows.map((p) => {
                      const deal = (dealsQuery.data ?? []).find((d) => d.id === p.deal_id);
                      const live = deal ? isDealCurrentlyActive(deal) : false;
                      const discounted = deal ? applyDealToPrice(p.price, deal) : p.price;
                      return (
                        <tr key={p.id} className="bg-surface transition hover:bg-surface-container-lowest">
                          <td className="max-w-[220px] px-4 py-4 align-top">
                            <p className="truncate font-semibold text-on-surface">{name(p)}</p>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className={live ? 'text-sm text-on-surface-variant line-through' : 'text-sm font-medium text-on-surface'}>
                                {money(p.price)}
                              </span>
                              {live ? <span className="text-sm font-semibold text-error">{money(discounted)}</span> : null}
                            </div>
                            {deal ? (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                                {live
                                  ? `${localizedName(deal, isAr)} · ${dealDiscountLabel(t, deal)}`
                                  : t('deals.inactiveSuffix', { label: `${localizedName(deal, isAr)} · ${dealDiscountLabel(t, deal)}` })}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 align-top text-xs text-on-surface-variant">
                            {p.coverage_type === 'unlimited'
                              ? t('packages.typeUnlimited')
                              : t('packages.typeQuota', { hours: p.included_hours ?? 0 })}
                          </td>
                          <td className="px-4 py-4 align-top text-xs text-on-surface-variant">
                            {p.validity_value && p.validity_unit
                              ? t('packages.validityLabel', { value: p.validity_value, unit: t(`packages.validityUnit.${p.validity_unit}`) })
                              : t('packages.validityNever')}
                          </td>
                          <td className="px-4 py-4 align-top text-on-surface">{t('packages.assignedCount', { count: p.assigned_count })}</td>
                          <td className="px-4 py-4 align-top">
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
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => setManagePkg(p)}>
                                {t('packages.manageChildren')}
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => openEdit(p)}>
                                {t('common.edit')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={update.isPending}
                                onClick={() => void toggleActive(p)}
                              >
                                {p.active ? t('packages.deactivate') : t('packages.activate')}
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
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={(o) => !busy && (o ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('packages.editTitle') : t('packages.addTitle')}
            </DialogTitle>
            <DialogDescription>{t('packages.formHint')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
            <FormSection title={t('packages.sections.name')} icon="badge">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                    {t('packages.fieldNameEn')}
                  </span>
                  <input
                    value={form.name_en}
                    aria-invalid={Boolean(nameError)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                    className={cn(inputClass, nameError && invalidFieldClass)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                    {t('packages.fieldNameAr')}
                  </span>
                  <input
                    dir="rtl"
                    value={form.name_ar}
                    aria-invalid={Boolean(nameError)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                    className={cn(inputClass, nameError && invalidFieldClass)}
                  />
                </label>
              </div>
              <FieldError message={nameError} />
            </FormSection>

            <FormSection title={t('packages.sections.coveragePrice')} icon="payments">
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
                    className={inputClass}
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
                    min={1}
                    step={1}
                    disabled={form.coverage_type !== 'hours_quota'}
                    value={form.included_hours ?? ''}
                    aria-invalid={Boolean(hoursError)}
                    onBlur={() => fields.touch('includedHours')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        included_hours: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className={cn(inputClass, 'disabled:opacity-50', hoursError && invalidFieldClass)}
                  />
                  <FieldError message={hoursError} className="mt-1" />
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
                    aria-invalid={Boolean(priceError)}
                    onBlur={() => fields.touch('price')}
                    onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
                    className={cn(inputClass, priceError && invalidFieldClass)}
                  />
                  <FieldError message={priceError} className="mt-1" />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                    {t('packages.fieldValidityValue')}
                  </span>
                  <input
                    type="number"
                    min={1}
                    placeholder={t('packages.validityNever')}
                    value={form.validity_value ?? ''}
                    aria-invalid={Boolean(validityValueError)}
                    onBlur={() => fields.touch('validityValue')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        validity_value: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className={cn(inputClass, validityValueError && invalidFieldClass)}
                  />
                  <FieldError message={validityValueError} className="mt-1" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-on-surface-variant">
                    {t('packages.fieldValidityUnit')}
                  </span>
                  <select
                    value={form.validity_unit ?? ''}
                    aria-invalid={Boolean(validityUnitError)}
                    onBlur={() => fields.touch('validityUnit')}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        validity_unit: (e.target.value || null) as ValidityUnit | null,
                      }));
                      fields.touch('validityUnit');
                    }}
                    className={cn(inputClass, validityUnitError && invalidFieldClass)}
                  >
                    <option value="">{t('packages.validityNever')}</option>
                    <option value="months">{t('packages.validityUnit.months')}</option>
                    <option value="years">{t('packages.validityUnit.years')}</option>
                  </select>
                  <FieldError message={validityUnitError} className="mt-1" />
                </label>
              </div>

              <label className="flex items-center gap-2 border-t border-outline-variant pt-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                {t('packages.fieldActive')}
              </label>
            </FormSection>

            <FormSection title={t('packages.sections.deal')} description={t('packages.sections.dealHint')} icon="sell">
              <PackageDealPicker
                nurseryId={nurseryId}
                dealId={form.deal_id}
                onChange={(deal_id) => setForm((f) => ({ ...f, deal_id }))}
                onCustomDealCreated={dealCleanup.track}
              />
            </FormSection>

            <FormSection title={t('packages.sections.description')} icon="description">
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
            </FormSection>
          </div>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
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
