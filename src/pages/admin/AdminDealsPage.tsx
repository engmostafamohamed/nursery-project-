import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormSection } from '@/components/admin/settings/FormSection';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  isDealCurrentlyActive,
  useAdminDeals,
  type DealDiscountType,
  type DealInput,
  type DealRow,
} from '@/hooks/useAdminDeals';
import { formatQueryError } from '@/lib/utils';

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

function discountSummary(deal: Pick<DealRow, 'discount_type' | 'discount_value'>): string {
  return deal.discount_type === 'percentage' ? `${deal.discount_value}% off` : `EGP ${deal.discount_value.toFixed(2)} off`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function validitySummary(deal: Pick<DealRow, 'starts_at' | 'ends_at' | 'active'>): string {
  if (!deal.active) return 'Inactive';
  const now = Date.now();
  if (deal.starts_at && new Date(deal.starts_at).getTime() > now) return `Starts ${fmtDateTime(deal.starts_at)}`;
  if (deal.ends_at && new Date(deal.ends_at).getTime() <= now) return 'Expired';
  if (deal.ends_at) return `Ends ${fmtDateTime(deal.ends_at)}`;
  return 'No expiry';
}

type StatusFilter = 'all' | 'live' | 'inactive';
type TypeFilter = 'all' | DealDiscountType;

export function AdminDealsPage() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const { query, create, update, toggleActive } = useAdminDeals(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DealInput>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [endsFrom, setEndsFrom] = useState('');
  const [endsTo, setEndsTo] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const busy = create.isPending || update.isPending;

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
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.name_ar.trim() && !form.name_en.trim()) {
      toast.error('Please enter a deal name.');
      return;
    }
    if (!form.discount_value || form.discount_value <= 0) {
      toast.error('Enter a discount value greater than zero.');
      return;
    }
    if (form.discount_type === 'percentage' && form.discount_value > 100) {
      toast.error('A percentage discount cannot exceed 100%.');
      return;
    }
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input: form });
      else await create.mutateAsync(form);
      toast.success('Deal saved.');
      setDialogOpen(false);
    } catch (error) {
      toast.error('Could not save the deal.', { description: formatQueryError(error) });
    }
  };

  const handleToggleActive = async (deal: DealRow) => {
    try {
      await toggleActive.mutateAsync({ id: deal.id, active: !deal.active });
      toast.success(deal.active ? 'Deal deactivated.' : 'Deal activated.');
    } catch (error) {
      toast.error('Could not update the deal.', { description: formatQueryError(error) });
    }
  };

  if (!nurseryId) return <LoadingSkeleton />;

  return (
    <div className="space-y-6 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Deals &amp; Discounts</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Create time-limited offers, then assign one to a tuition or extra-hours package from its own editor.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <MaterialSymbol name="sell" size="text-base" />
          New deal
        </Button>
      </header>

      {query.isLoading ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="sell"
          title="No deals yet"
          description="Create one to offer parents a limited-time discount on a package."
          action={
            <Button type="button" onClick={openCreate}>
              <MaterialSymbol name="add" size="text-base" />
              New deal
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface p-3 shadow-sm">
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label className="text-xs font-semibold text-on-surface-variant">Search</Label>
              <Input className="h-11" placeholder="Deal name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <FilterMenu<StatusFilter>
              className="w-48"
              label="Status"
              icon="toggle_on"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'live', label: 'Live only' },
                { value: 'inactive', label: 'Inactive / expired' },
              ]}
            />
            <FilterMenu<TypeFilter>
              className="w-52"
              label="Discount type"
              icon="sell"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'all', label: 'All types' },
                { value: 'percentage', label: 'Percentage off' },
                { value: 'fixed_amount', label: 'Fixed amount off' },
              ]}
            />
            <div className="w-40 space-y-1">
              <Label className="text-xs font-semibold text-on-surface-variant">Ends after</Label>
              <Input className="h-11" type="date" value={endsFrom} onChange={(e) => setEndsFrom(e.target.value)} />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-xs font-semibold text-on-surface-variant">Ends before</Label>
              <Input className="h-11" type="date" value={endsTo} onChange={(e) => setEndsTo(e.target.value)} />
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <MaterialSymbol name="close" size="text-base" />
                Clear filters
              </Button>
            ) : null}
          </div>

          {filteredRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
              No deals match these filters.
            </p>
          ) : (
            <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">Deal</th>
                      <th className="px-4 py-3 text-start font-semibold">Discount</th>
                      <th className="px-4 py-3 text-start font-semibold">Status</th>
                      <th className="px-4 py-3 text-start font-semibold">Window</th>
                      <th className="px-4 py-3 text-start font-semibold">Packages</th>
                      <th className="px-4 py-3 text-start font-semibold">Children</th>
                      <th className="px-4 py-3 text-end font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {filteredRows.map((deal) => {
                      const live = isDealCurrentlyActive(deal);
                      const expanded = expandedIds.has(deal.id);
                      return (
                        <Fragment key={deal.id}>
                          <tr className="bg-surface transition hover:bg-surface-container-lowest">
                            <td className="max-w-[220px] px-4 py-4 align-top">
                              <p className="truncate font-semibold text-on-surface">{deal.name_en || deal.name_ar}</p>
                              {deal.description_en || deal.description_ar ? (
                                <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                                  {deal.description_en || deal.description_ar}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 align-top font-medium text-on-surface">{discountSummary(deal)}</td>
                            <td className="px-4 py-4 align-top">
                              <Badge variant={live ? 'success' : 'secondary'}>{live ? 'Live' : validitySummary(deal)}</Badge>
                            </td>
                            <td className="px-4 py-4 align-top text-xs text-on-surface-variant">
                              {deal.starts_at ? <>From {fmtDateTime(deal.starts_at)}<br /></> : null}
                              {deal.ends_at ? <>Until {fmtDateTime(deal.ends_at)}</> : 'No expiry'}
                            </td>
                            <td className="px-4 py-4 align-top">
                              {deal.assigned_packages.length === 0 ? (
                                <span className="text-xs text-on-surface-variant">Not assigned</span>
                              ) : (
                                <div className="flex max-w-[220px] flex-wrap gap-1">
                                  {deal.assigned_packages.map((p) => (
                                    <Link
                                      key={p.id}
                                      to="/admin/packages"
                                      title="Open Packages to edit this one"
                                      className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest px-2 py-0.5 text-xs text-on-surface hover:border-primary hover:text-primary"
                                    >
                                      <MaterialSymbol name={p.kind === 'tuition' ? 'payments' : 'schedule'} size="text-xs" />
                                      {p.nameEn || p.nameAr}
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
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={toggleActive.isPending}
                                  onClick={() => void handleToggleActive(deal)}
                                >
                                  {deal.active ? 'Deactivate' : 'Activate'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="bg-surface-container-lowest">
                              <td colSpan={7} className="px-4 py-3">
                                <p className="mb-1.5 text-xs font-semibold uppercase text-on-surface-variant">
                                  Children using this discount
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {deal.assigned_packages.flatMap((p) =>
                                    p.children.map((c) => (
                                      <span
                                        key={`${p.id}-${c.id}`}
                                        className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface px-2 py-0.5 text-xs text-on-surface"
                                      >
                                        {c.nameEn || c.nameAr}
                                        <span className="text-on-surface-variant">· {p.nameEn || p.nameAr}</span>
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
            <DialogTitle>{editingId ? 'Edit deal' : 'New deal'}</DialogTitle>
            <DialogDescription>Set the discount and, optionally, when it starts and ends.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pe-1">
            <FormSection title="Deal name" icon="badge">
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

            <FormSection title="Discount" icon="sell">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Discount type</Label>
                  <FilterMenu<DealDiscountType>
                    value={form.discount_type}
                    onChange={(discount_type) => setForm((f) => ({ ...f, discount_type }))}
                    options={[
                      { value: 'percentage', label: 'Percentage off', icon: 'percent' },
                      { value: 'fixed_amount', label: 'Fixed amount off (EGP)', icon: 'payments' },
                    ]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{form.discount_type === 'percentage' ? 'Discount (%)' : 'Discount (EGP)'}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={form.discount_type === 'percentage' ? 100 : undefined}
                    step={form.discount_type === 'percentage' ? 1 : 0.01}
                    value={form.discount_value}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 border-t border-outline-variant pt-3 text-sm text-on-surface">
                <Checkbox
                  checked={form.active}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked === true }))}
                />
                Active
              </label>
            </FormSection>

            <FormSection
              title="Time window"
              description="Optional — leave both blank for a deal with no start or expiry."
              icon="schedule"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Starts (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocalValue(form.starts_at)}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: fromDatetimeLocalValue(e.target.value) }))}
                  />
                  <p className="text-xs text-on-surface-variant">Leave blank to start immediately.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Ends (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocalValue(form.ends_at)}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: fromDatetimeLocalValue(e.target.value) }))}
                  />
                  <p className="text-xs text-on-surface-variant">
                    Shown to parents as a live countdown. Leave blank for no expiry.
                  </p>
                </div>
              </div>
            </FormSection>

            <FormSection title="Description" icon="description">
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
    </div>
  );
}
