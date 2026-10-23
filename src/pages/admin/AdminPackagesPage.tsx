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
import { IconAction, TableCard, TableEmpty, TableLoading, TablePagination } from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPackageCard } from '@/components/admin/settings/AdminPackageCard';
import { dealDiscountLabel, localizedName } from '@/components/admin/settings/dealLabels';
import { ExtraHoursHourlyRateCard } from '@/components/admin/settings/ExtraHoursHourlyRateCard';
import { FormSection } from '@/components/admin/settings/FormSection';
import { PackageDealPicker } from '@/components/admin/settings/PackageDealPicker';
import { PackageSectionTextsCard } from '@/components/admin/settings/PackageSectionTextsCard';
import { TuitionPackagesEditor } from '@/components/admin/settings/TuitionPackagesEditor';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { useAdminDeals, isDealCurrentlyActive, applyDealToPrice, useInlineDealCleanup } from '@/hooks/useAdminDeals';
import { useAdminTuitionPackages } from '@/hooks/useAdminTuitionPackages';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useBulkTuitionAssignment } from '@/hooks/useBulkTuitionAssignment';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { usePagination } from '@/hooks/usePagination';
import { useTouchedFields } from '@/hooks/useTouchedFields';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatMoneyAmount } from '@/lib/money';
import { extraHoursPackageFormIssues, hasIssues } from '@/lib/packageForms';
import { cn, formatQueryError, getUserInitials } from '@/lib/utils';
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
          <Select className="flex-1" aria-label={t('packages.selectChild')} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{t('packages.selectChild')}</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {isAr ? c.full_name_ar || c.full_name_en : c.full_name_en || c.full_name_ar}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            className="h-12"
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
            <MaterialSymbol name="person_add" size="text-base" />
            {t('packages.assign')}
          </Button>
        </div>

        <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-lg border border-outline-variant">
          {query.isPending ? (
            <div className="p-3">
              <LoadingSkeleton />
            </div>
          ) : assigned.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-8 text-center text-sm text-on-surface-variant">
              <MaterialSymbol name="group_off" size="text-3xl" />
              {t('packages.noChildren')}
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {assigned.map((a) => {
                const childName = (isAr ? a.childNameAr || a.childNameEn : a.childNameEn || a.childNameAr) || '-';
                const total = pkg.included_hours ?? 0;
                const usedPct = total > 0 ? Math.min(100, Math.round((a.hours_used / total) * 100)) : 0;
                return (
                  <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                      {getUserInitials(childName, null)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-on-surface">{childName}</p>
                      {pkg.coverage_type === 'hours_quota' ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-high">
                            <span
                              className={cn('block h-full rounded-full', usedPct >= 90 ? 'bg-error' : usedPct >= 60 ? 'bg-warning' : 'bg-success')}
                              style={{ width: `${usedPct}%` }}
                            />
                          </span>
                          <span className="text-xs tabular-nums text-on-surface-variant">
                            {t('packages.hoursUsed', { used: a.hours_used, total })}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <IconAction
                      icon="person_remove"
                      label={t('packages.removeChild')}
                      danger
                      disabled={unassign.isPending}
                      onClick={async () => {
                        try {
                          await unassign.mutateAsync(a.id);
                          toast.success(t('packages.childRemoved'));
                        } catch {
                          toast.error(t('packages.saveFailed'));
                        }
                      }}
                    />
                  </li>
                );
              })}
            </ul>
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

  const hoursPager = usePagination(filteredRows, 9, `${search}|${statusFilter}|${coverageFilter}|${dealFilter}`);

  // The header tiles: both kinds of package, the children still without a tuition package, and
  // the packages with a live discount.
  const [tab, setTab] = useState<'fixed' | 'hours'>('fixed');
  const [assignOpen, setAssignOpen] = useState(false);
  const { query: tuitionQuery } = useAdminTuitionPackages(nurseryId);
  const { childrenQuery: billingChildrenQuery } = useBulkTuitionAssignment(nurseryId);
  const tuitionRows = useMemo(() => tuitionQuery.data ?? [], [tuitionQuery.data]);
  const billingChildren = billingChildrenQuery.data ?? [];
  const childrenWithoutPackage = billingChildren.filter((c) => !c.currentPackageEn && !c.currentPackageAr).length;
  const liveDiscounts = useMemo(() => {
    const live = new Set((dealsQuery.data ?? []).filter((deal) => isDealCurrentlyActive(deal)).map((deal) => deal.id));
    return [...tuitionRows, ...rows].filter((p) => p.deal_id && live.has(p.deal_id)).length;
  }, [dealsQuery.data, tuitionRows, rows]);
  const activeTuition = tuitionRows.filter((p) => p.active).length;

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
    <div className="space-y-5 p-4">
      <PageHeader icon="package_2" title={t('packages.pageTitle')} description={t('packages.pageSubtitle')}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="school"
            label={t('tuitionPackages.title')}
            value={tuitionRows.length}
            helper={t('packages.overview.activeCount', { count: activeTuition })}
            onClick={() => setTab('fixed')}
            active={tab === 'fixed'}
          />
          <StatTile
            icon="group_add"
            label={t('packages.overview.withoutPackage')}
            value={billingChildrenQuery.isLoading ? '—' : childrenWithoutPackage}
            helper={t('packages.overview.ofActiveChildren', { count: billingChildren.length })}
            tone={childrenWithoutPackage > 0 ? 'warning' : 'success'}
            onClick={
              activeTuition > 0 && childrenWithoutPackage > 0
                ? () => {
                    setTab('fixed');
                    setAssignOpen(true);
                  }
                : undefined
            }
          />
          <StatTile
            icon="more_time"
            label={t('packages.tabHours')}
            value={rows.length}
            helper={t('packages.overview.activeCount', { count: rows.filter((p) => p.active).length })}
            onClick={() => setTab('hours')}
            active={tab === 'hours'}
          />
          <StatTile
            icon="sell"
            label={t('packages.overview.onDiscount')}
            value={liveDiscounts}
            helper={t('packages.overview.onDiscountHint')}
            tone={liveDiscounts > 0 ? 'warning' : 'neutral'}
          />
        </div>
      </PageHeader>

      <Tabs value={tab} onValueChange={(value: string) => setTab(value as 'fixed' | 'hours')}>
        <TabsList>
          <TabsTrigger value="fixed">
            <MaterialSymbol name="school" size="text-base" className="me-1" />
            {t('packages.tabFixed')}
          </TabsTrigger>
          <TabsTrigger value="hours">
            <MaterialSymbol name="more_time" size="text-base" className="me-1" />
            {t('packages.tabHours')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="space-y-5">
          <PackageSectionTextsCard nurseryId={nurseryId} section="tuition" />
          <TuitionPackagesEditor nurseryId={nurseryId} assignOpen={assignOpen} onAssignOpenChange={setAssignOpen} />
        </TabsContent>

        <TabsContent value="hours" className="space-y-5">
          <ExtraHoursHourlyRateCard nurseryId={nurseryId} />
          <PackageSectionTextsCard nurseryId={nurseryId} section="extraHours" />

          <TableCard
            title={t('packages.tabHours')}
            description={t('packages.subtitle')}
            count={rows.length ? t('packages.overview.count', { count: filteredRows.length }) : undefined}
            actions={
              <Button type="button" onClick={openCreate}>
                <MaterialSymbol name="add" size="text-base" />
                {t('packages.addButton')}
              </Button>
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
                      <option value="active">{t('packages.active')}</option>
                      <option value="inactive">{t('packages.inactive')}</option>
                    </Select>
                  </FilterField>
                  <FilterField label={t('packages.fieldType')}>
                    <Select value={coverageFilter} onChange={(e) => setCoverageFilter(e.target.value as typeof coverageFilter)}>
                      <option value="all">{t('packageFilters.allTypes')}</option>
                      <option value="unlimited">{t('packages.optUnlimited')}</option>
                      <option value="hours_quota">{t('packages.optQuota')}</option>
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
            pagination={filteredRows.length ? <TablePagination pager={hoursPager} pageSizeOptions={[9, 18, 36]} /> : null}
          >
            {query.isPending ? (
              <TableLoading />
            ) : rows.length === 0 ? (
              <TableEmpty
                icon="package_2"
                title={t('packages.emptyTitle')}
                description={t('packages.emptyDescription')}
                action={
                  <Button type="button" onClick={openCreate}>
                    <MaterialSymbol name="add" size="text-base" />
                    {t('packages.addButton')}
                  </Button>
                }
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
                {hoursPager.pageItems.map((p) => {
                  const deal = (dealsQuery.data ?? []).find((d) => d.id === p.deal_id);
                  const live = deal ? isDealCurrentlyActive(deal) : false;
                  const dealLabel = deal ? `${localizedName(deal, isAr)} · ${dealDiscountLabel(t, deal)}` : '';
                  return (
                    <AdminPackageCard
                      key={p.id}
                      icon="more_time"
                      name={name(p)}
                      active={p.active}
                      price={money(p.price)}
                      discountedPrice={deal && live ? money(applyDealToPrice(p.price, deal)) : null}
                      deal={deal ? { label: live ? dealLabel : t('deals.inactiveSuffix', { label: dealLabel }), live } : null}
                      description={isAr ? p.description_ar || p.description_en : p.description_en || p.description_ar}
                      emptyHint={t('packageCard.noDescription')}
                      facts={[
                        {
                          icon: 'more_time',
                          label: p.coverage_type === 'unlimited' ? t('packages.typeUnlimited') : t('packages.typeQuota', { hours: p.included_hours ?? 0 }),
                        },
                        {
                          icon: 'event_available',
                          label:
                            p.validity_value && p.validity_unit
                              ? t('packages.validityLabel', { value: p.validity_value, unit: t(`packages.validityUnit.${p.validity_unit}`) })
                              : t('packages.validityNever'),
                        },
                        { icon: 'groups', label: t('packages.assignedCount', { count: p.assigned_count }) },
                      ]}
                      actions={
                        <>
                          {/* The switch shows the package's state; clicking flips it. */}
                          <IconAction
                            icon={p.active ? 'toggle_on' : 'toggle_off'}
                            label={p.active ? t('packages.deactivate') : t('packages.activate')}
                            disabled={update.isPending}
                            onClick={() => void toggleActive(p)}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => setManagePkg(p)}>
                            <MaterialSymbol name="group" size="text-base" />
                            {t('packages.manageChildren')}
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(p)}>
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
