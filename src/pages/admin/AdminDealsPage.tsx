import type { TFunction } from 'i18next';
import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { dealDiscountLabel, localizedName } from '@/components/admin/settings/dealLabels';
import { FormSection } from '@/components/admin/settings/FormSection';
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
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
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

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{t('deals.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{t('deals.subtitle')}</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <MaterialSymbol name="sell" size="text-base" />
          {t('deals.newDeal')}
        </Button>
      </header>

      {query.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="sell"
          title={t('deals.emptyTitle')}
          description={t('deals.emptyDescription')}
          action={
            <Button type="button" onClick={openCreate}>
              <MaterialSymbol name="add" size="text-base" />
              {t('deals.newDeal')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label className="text-xs font-semibold text-on-surface-variant">{t('packageFilters.search')}</Label>
              <Input
                className="h-11"
                placeholder={t('deals.filters.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterMenu<StatusFilter>
              className="w-48"
              label={t('packageFilters.status')}
              icon="toggle_on"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: t('packageFilters.allStatuses') },
                { value: 'live', label: t('deals.filters.liveOnly') },
                { value: 'inactive', label: t('deals.filters.inactiveOrExpired') },
              ]}
            />
            <FilterMenu<TypeFilter>
              className="w-52"
              label={t('deals.filters.type')}
              icon="sell"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'all', label: t('packageFilters.allTypes') },
                { value: 'percentage', label: t('deals.types.percentage') },
                { value: 'fixed_amount', label: t('deals.types.fixed_amount') },
              ]}
            />
            <div className="w-40 space-y-1">
              <Label className="text-xs font-semibold text-on-surface-variant">{t('deals.filters.endsAfter')}</Label>
              <Input className="h-11" type="date" value={endsFrom} onChange={(e) => setEndsFrom(e.target.value)} />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-xs font-semibold text-on-surface-variant">{t('deals.filters.endsBefore')}</Label>
              <Input className="h-11" type="date" value={endsTo} onChange={(e) => setEndsTo(e.target.value)} />
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <MaterialSymbol name="close" size="text-base" />
                {t('packageFilters.clear')}
              </Button>
            ) : null}
          </div>

          {filteredRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
              {t('deals.filters.noMatch')}
            </p>
          ) : (
            <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">{t('deals.columns.deal')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('deals.columns.discount')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('deals.columns.status')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('deals.columns.window')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('deals.columns.packages')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{t('deals.columns.children')}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t('deals.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {filteredRows.map((deal) => {
                      const live = isDealCurrentlyActive(deal);
                      const expanded = expandedIds.has(deal.id);
                      const description = isAr ? deal.description_ar || deal.description_en : deal.description_en || deal.description_ar;
                      return (
                        <Fragment key={deal.id}>
                          <tr className="bg-surface transition hover:bg-surface-container-lowest">
                            <td className="max-w-[220px] px-4 py-4 align-top">
                              <p className="truncate font-semibold text-on-surface">{localizedName(deal, isAr)}</p>
                              {description ? <p className="mt-0.5 truncate text-xs text-on-surface-variant">{description}</p> : null}
                            </td>
                            <td className="px-4 py-4 align-top font-medium text-on-surface">{dealDiscountLabel(t, deal)}</td>
                            <td className="px-4 py-4 align-top">
                              <Badge variant={live ? 'success' : 'secondary'}>{live ? t('deals.state.live') : dealStateLabel(t, deal)}</Badge>
                            </td>
                            <td className="px-4 py-4 align-top text-xs text-on-surface-variant">
                              {deal.starts_at ? (
                                <>
                                  {t('deals.windowFrom', { date: formatDateTime(deal.starts_at) })}
                                  <br />
                                </>
                              ) : null}
                              {deal.ends_at ? t('deals.windowUntil', { date: formatDateTime(deal.ends_at) }) : t('deals.state.noExpiry')}
                            </td>
                            <td className="px-4 py-4 align-top">
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
                            </td>
                            <td className="px-4 py-4 align-top">
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
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => openEdit(deal)}>
                                  {t('common.edit')}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={toggleActive.isPending}
                                  onClick={() => void handleToggleActive(deal)}
                                >
                                  {deal.active ? t('packages.deactivate') : t('packages.activate')}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="bg-surface-container-lowest">
                              <td colSpan={7} className="px-4 py-3">
                                <p className="mb-1.5 text-xs font-semibold uppercase text-on-surface-variant">{t('deals.childrenUsing')}</p>
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
