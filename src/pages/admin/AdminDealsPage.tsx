import type { TFunction } from 'i18next';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { dealDiscountLabel, localizedName } from '@/components/admin/settings/dealLabels';
import { FormSection } from '@/components/admin/settings/FormSection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DataTable,
  IconAction,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useTouchedFields } from '@/hooks/useTouchedFields';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  isDealCurrentlyActive,
  useAdminDeals,
  type DealDiscountType,
  type DealInput,
  type DealRow,
} from '@/hooks/useAdminDeals';
import { formatDateTime } from '@/lib/datetime';
import { dealFormIssues, hasIssues } from '@/lib/packageForms';
import { cn, formatQueryError } from '@/lib/utils';

const EMPTY_FORM: DealInput = {
  name_ar: '',
  name_en: '',
  description_ar: null,
  description_en: null,
  discount_type: 'percentage',
  discount_value: 10,
  starts_at: null,
  ends_at: null,
  active: true,
};

/** <input type="datetime-local"> needs 'YYYY-MM-DDTHH:mm' in LOCAL time, not the ISO UTC string
 * the DB returns — this converts each direction. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Why a deal is not live (switched off, not started, ended), or when it ends. */
function dealStateLabel(t: TFunction, deal: Pick<DealRow, 'active' | 'starts_at' | 'ends_at'>): string {
  if (!deal.active) return t('deals.state.inactive');
  const now = Date.now();
  if (deal.starts_at && new Date(deal.starts_at).getTime() > now) return t('deals.state.startsAt', { date: formatDateTime(deal.starts_at) });
  if (deal.ends_at && new Date(deal.ends_at).getTime() <= now) return t('deals.state.expired');
  if (deal.ends_at) return t('deals.state.endsAt', { date: formatDateTime(deal.ends_at) });
  return t('deals.state.noExpiry');
}

type StatusFilter = 'all' | 'live' | 'inactive';
type TypeFilter = 'all' | DealDiscountType;
type DealField = 'name' | 'discountValue' | 'endsAt';

export function AdminDealsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const { query, create, update, toggleActive } = useAdminDeals(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DealInput>(EMPTY_FORM);
  const fields = useTouchedFields<DealField>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [endsFrom, setEndsFrom] = useState('');
  const [endsTo, setEndsTo] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const busy = create.isPending || update.isPending;
  const issues = dealFormIssues(form);
  const errorFor = (field: DealField) => {
    const issue = issues[field];
    return fields.isShown(field) && issue ? t(`packageForms.errors.${issue}`) : null;
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((deal) => {
      const live = isDealCurrentlyActive(deal);
      if (statusFilter === 'live' && !live) return false;
      if (statusFilter === 'inactive' && live) return false;
      if (typeFilter !== 'all' && deal.discount_type !== typeFilter) return false;
      if (q && !`${deal.name_en} ${deal.name_ar}`.toLowerCase().includes(q)) return false;
      if (endsFrom || endsTo) {
        if (!deal.ends_at) return false;
        const endsMs = new Date(deal.ends_at).getTime();
        if (endsFrom && endsMs < new Date(endsFrom).getTime()) return false;
        if (endsTo && endsMs > new Date(`${endsTo}T23:59:59`).getTime()) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, typeFilter, endsFrom, endsTo]);

  const hasActiveFilters = Boolean(search || statusFilter !== 'all' || typeFilter !== 'all' || endsFrom || endsTo);
  const pager = usePagination(filteredRows, 10, `${search}|${statusFilter}|${typeFilter}|${endsFrom}|${endsTo}`);
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setEndsFrom('');
    setEndsTo('');
  };

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    fields.reset();
    setDialogOpen(true);
  };

  const openEdit = (deal: DealRow) => {
    setEditingId(deal.id);
    setForm({
      name_ar: deal.name_ar,
      name_en: deal.name_en,
      description_ar: deal.description_ar,
      description_en: deal.description_en,
      discount_type: deal.discount_type,
      discount_value: deal.discount_value,
      starts_at: deal.starts_at,
      ends_at: deal.ends_at,
      active: deal.active,
    });
    fields.reset();
    setDialogOpen(true);
  };

  const submit = async () => {
    if (hasIssues(issues)) {
      fields.showAll();
      return;
    }
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input: form });
      else await create.mutateAsync(form);
      toast.success(t('deals.saved'));
      setDialogOpen(false);
    } catch (error) {
      toast.error(t('deals.saveFailed'), { description: formatQueryError(error) });
    }
  };

  const handleToggleActive = async (deal: DealRow) => {
    try {
      await toggleActive.mutateAsync({ id: deal.id, active: !deal.active });
      toast.success(deal.active ? t('deals.deactivated') : t('deals.activated'));
    } catch (error) {
      toast.error(t('deals.updateFailed'), { description: formatQueryError(error) });
    }
  };

  if (!nurseryId) return <LoadingSkeleton />;

  const nameError = errorFor('name');
  const valueError = errorFor('discountValue');
  const endsError = errorFor('endsAt');

  const liveCount = rows.filter((deal) => isDealCurrentlyActive(deal)).length;
  const childrenUsing = rows.reduce((sum, deal) => sum + deal.children_count, 0);
  const toggleStatus = (value: StatusFilter) => setStatusFilter((current) => (current === value ? 'all' : value));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="sell"
        title={t('deals.title')}
        description={t('deals.subtitle')}
        actions={
          <Button type="button" onClick={openCreate}>
            <MaterialSymbol name="add" size="text-base" className="me-1" />
            {t('deals.newDeal')}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="sell" label={t('deals.title')} value={rows.length} onClick={clearFilters} active={!hasActiveFilters} />
          <StatTile
            icon="bolt"
            label={t('deals.filters.liveOnly')}
            value={liveCount}
            tone="success"
            onClick={() => toggleStatus('live')}
            active={statusFilter === 'live'}
          />
          <StatTile
            icon="pause_circle"
            label={t('deals.filters.inactiveOrExpired')}
            value={rows.length - liveCount}
            tone="neutral"
            onClick={() => toggleStatus('inactive')}
            active={statusFilter === 'inactive'}
          />
          <StatTile icon="groups" label={t('deals.columns.children')} value={childrenUsing} />
        </div>
      </PageHeader>

      <TableCard
        title={t('deals.title')}
        count={query.isLoading ? undefined : t('deals.resultsCount', { count: filteredRows.length })}
        filters={
          rows.length ? (
            <FilterBar onClear={clearFilters} canClear={hasActiveFilters}>
              <FilterField label={t('packageFilters.search')} className="sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('deals.filters.searchPlaceholder')} />
              </FilterField>
              <FilterField label={t('packageFilters.status')}>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                  <option value="all">{t('packageFilters.allStatuses')}</option>
                  <option value="live">{t('deals.filters.liveOnly')}</option>
                  <option value="inactive">{t('deals.filters.inactiveOrExpired')}</option>
                </Select>
              </FilterField>
              <FilterField label={t('deals.filters.type')}>
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
                  <option value="all">{t('packageFilters.allTypes')}</option>
                  <option value="percentage">{t('deals.types.percentage')}</option>
                  <option value="fixed_amount">{t('deals.types.fixed_amount')}</option>
                </Select>
              </FilterField>
              <FilterField label={t('deals.filters.endsAfter')}>
                <Input type="date" value={endsFrom} max={endsTo || undefined} onChange={(e) => setEndsFrom(e.target.value)} />
              </FilterField>
              <FilterField label={t('deals.filters.endsBefore')}>
                <Input type="date" value={endsTo} min={endsFrom || undefined} onChange={(e) => setEndsTo(e.target.value)} />
              </FilterField>
            </FilterBar>
          ) : null
        }
        pagination={query.isLoading || !filteredRows.length ? null : <TablePagination pager={pager} />}
      >
        {query.isLoading ? (
          <TableLoading />
        ) : rows.length === 0 ? (
          <TableEmpty
            icon="sell"
            title={t('deals.emptyTitle')}
            description={t('deals.emptyDescription')}
            action={
              <Button type="button" onClick={openCreate}>
                <MaterialSymbol name="add" size="text-base" className="me-1" />
                {t('deals.newDeal')}
              </Button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <TableEmpty icon="search_off" title={t('deals.filters.noMatch')} />
        ) : (
          <DataTable minWidth={920}>
            <THead>
              <Th>{t('deals.columns.deal')}</Th>
              <Th>{t('deals.columns.discount')}</Th>
              <Th>{t('deals.columns.status')}</Th>
              <Th>{t('deals.columns.window')}</Th>
              <Th>{t('deals.columns.packages')}</Th>
              <Th>{t('deals.columns.children')}</Th>
              <Th align="end">{t('deals.columns.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((deal) => {
                const live = isDealCurrentlyActive(deal);
                const expanded = expandedIds.has(deal.id);
                const description = isAr ? deal.description_ar || deal.description_en : deal.description_en || deal.description_ar;
                return (
                  <Fragment key={deal.id}>
                    <Tr>
                      <Td className="max-w-[220px] align-top">
                        <p className="truncate font-semibold text-on-surface">{localizedName(deal, isAr)}</p>
                        {description ? <p className="mt-0.5 truncate text-xs text-on-surface-variant">{description}</p> : null}
                      </Td>
                      <Td className="align-top font-medium text-on-surface">{dealDiscountLabel(t, deal)}</Td>
                      <Td className="align-top">
                        <StatusPill tone={live ? 'success' : 'neutral'}>{live ? t('deals.state.live') : dealStateLabel(t, deal)}</StatusPill>
                      </Td>
                      <Td className="align-top text-xs text-on-surface-variant">
                        {deal.starts_at ? (
                          <>
                            {t('deals.windowFrom', { date: formatDateTime(deal.starts_at) })}
                            <br />
                          </>
                        ) : null}
                        {deal.ends_at ? t('deals.windowUntil', { date: formatDateTime(deal.ends_at) }) : t('deals.state.noExpiry')}
                      </Td>
                      <Td className="align-top">
                        {deal.assigned_packages.length === 0 ? (
                          <span className="text-xs text-on-surface-variant">{t('deals.notAssigned')}</span>
                        ) : (
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {deal.assigned_packages.map((p) => (
                              <Link
                                key={p.id}
                                to="/admin/packages"
                                title={t('deals.openPackages')}
                                className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-xs text-on-surface hover:border-primary hover:text-primary"
                              >
                                <MaterialSymbol name={p.kind === 'tuition' ? 'payments' : 'schedule'} size="text-xs" />
                                {isAr ? p.nameAr || p.nameEn : p.nameEn || p.nameAr}
                              </Link>
                            ))}
                          </div>
                        )}
                      </Td>
                      <Td className="align-top">
                        {deal.children_count === 0 ? (
                          <span className="text-xs text-on-surface-variant">0</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(deal.id)}
                            aria-expanded={expanded}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                          >
                            <MaterialSymbol name="groups" size="text-xs" />
                            {deal.children_count}
                            <MaterialSymbol name={expanded ? 'expand_less' : 'expand_more'} size="text-xs" />
                          </button>
                        )}
                      </Td>
                      <Td align="end" className="align-top">
                        <div className="flex items-center justify-end gap-1">
                          <IconAction icon="edit" label={`${t('common.edit')}: ${localizedName(deal, isAr)}`} onClick={() => openEdit(deal)} />
                          <IconAction
                            icon={deal.active ? 'toggle_on' : 'toggle_off'}
                            label={`${deal.active ? t('packages.deactivate') : t('packages.activate')}: ${localizedName(deal, isAr)}`}
                            onClick={() => void handleToggleActive(deal)}
                            disabled={toggleActive.isPending}
                          />
                        </div>
                      </Td>
                    </Tr>
                    {expanded ? (
                      <tr className="bg-surface-container-lowest">
                        <td colSpan={7} className="px-4 py-3">
                          <p className="mb-1.5 text-xs font-semibold text-on-surface-variant">{t('deals.childrenUsing')}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {deal.assigned_packages.flatMap((p) =>
                              p.children.map((c) => (
                                <span
                                  key={`${p.id}-${c.id}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-2 py-0.5 text-xs text-on-surface"
                                >
                                  {isAr ? c.nameAr || c.nameEn : c.nameEn || c.nameAr}
                                  <span className="text-on-surface-variant">· {isAr ? p.nameAr || p.nameEn : p.nameEn || p.nameAr}</span>
                                </span>
                              )),
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      <Dialog open={dialogOpen} onOpenChange={(open) => !busy && setDialogOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t('deals.dialog.editTitle') : t('deals.dialog.newTitle')}</DialogTitle>
            <DialogDescription>{t('deals.dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
            <FormSection title={t('deals.sections.name')} icon="badge">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="deal-name-en">{t('deals.fields.nameEn')}</Label>
                  <Input
                    id="deal-name-en"
                    value={form.name_en}
                    aria-invalid={Boolean(nameError)}
                    className={cn(nameError && invalidFieldClass)}
                    onBlur={() => fields.touch('name')}
                    onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="deal-name-ar">{t('deals.fields.nameAr')}</Label>
                  <Input
                    id="deal-name-ar"
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

            <FormSection title={t('deals.sections.discount')} icon="sell">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('deals.fields.type')}</Label>
                  <FilterMenu<DealDiscountType>
                    value={form.discount_type}
                    onChange={(discount_type) => setForm((f) => ({ ...f, discount_type }))}
                    options={[
                      { value: 'percentage', label: t('deals.types.percentage'), icon: 'percent' },
                      { value: 'fixed_amount', label: t('deals.types.fixed_amount'), icon: 'payments' },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="deal-value">
                    {form.discount_type === 'percentage' ? t('deals.fields.valuePercent') : t('deals.fields.valueAmount')}
                  </Label>
                  <Input
                    id="deal-value"
                    type="number"
                    min={0}
                    max={form.discount_type === 'percentage' ? 100 : undefined}
                    step={form.discount_type === 'percentage' ? 1 : 0.01}
                    value={form.discount_value}
                    aria-invalid={Boolean(valueError)}
                    className={cn(valueError && invalidFieldClass)}
                    onBlur={() => fields.touch('discountValue')}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))}
                  />
                  <FieldError message={valueError} />
                </div>
              </div>
              <label className="flex items-center gap-2 border-t border-outline-variant pt-3 text-sm text-on-surface">
                <Checkbox checked={form.active} onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))} />
                {t('deals.fields.active')}
              </label>
            </FormSection>

            <FormSection title={t('deals.sections.window')} description={t('deals.sections.windowHint')} icon="schedule">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="deal-starts">{t('deals.fields.starts')}</Label>
                  <Input
                    id="deal-starts"
                    type="datetime-local"
                    value={toDatetimeLocalValue(form.starts_at)}
                    onBlur={() => fields.touch('endsAt')}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: fromDatetimeLocalValue(e.target.value) }))}
                  />
                  <p className="text-xs text-on-surface-variant">{t('deals.fields.startsHint')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="deal-ends">{t('deals.fields.ends')}</Label>
                  <Input
                    id="deal-ends"
                    type="datetime-local"
                    value={toDatetimeLocalValue(form.ends_at)}
                    aria-invalid={Boolean(endsError)}
                    className={cn(endsError && invalidFieldClass)}
                    onBlur={() => fields.touch('endsAt')}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: fromDatetimeLocalValue(e.target.value) }))}
                  />
                  {endsError ? <FieldError message={endsError} /> : <p className="text-xs text-on-surface-variant">{t('deals.fields.endsHint')}</p>}
                </div>
              </div>
            </FormSection>

            <FormSection title={t('deals.sections.description')} icon="description">
              <div className="space-y-1.5">
                <Label htmlFor="deal-desc-en">{t('deals.fields.descEn')}</Label>
                <Textarea
                  id="deal-desc-en"
                  className="min-h-16"
                  value={form.description_en ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deal-desc-ar">{t('deals.fields.descAr')}</Label>
                <Textarea
                  id="deal-desc-ar"
                  dir="rtl"
                  className="min-h-16"
                  value={form.description_ar ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, description_ar: e.target.value || null }))}
                />
              </div>
            </FormSection>
          </div>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
