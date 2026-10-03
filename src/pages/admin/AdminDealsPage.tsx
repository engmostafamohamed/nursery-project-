import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
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

export function AdminDealsPage() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? null;

  const { query, create, update, toggleActive } = useAdminDeals(nurseryId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DealInput>(EMPTY_FORM);

  const rows = query.data ?? [];
  const busy = create.isPending || update.isPending;

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
      toast.error(error instanceof Error ? error.message : 'Could not save the deal.');
    }
  };

  const handleToggleActive = async (deal: DealRow) => {
    try {
      await toggleActive.mutateAsync({ id: deal.id, active: !deal.active });
      toast.success(deal.active ? 'Deal deactivated.' : 'Deal activated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the deal.');
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
          {rows.map((deal) => {
            const live = isDealCurrentlyActive(deal);
            return (
              <div
                key={deal.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-on-surface">{deal.name_en || deal.name_ar}</span>
                    <Badge variant={live ? 'success' : 'secondary'}>{live ? 'Live' : validitySummary(deal)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {discountSummary(deal)}
                    {' · '}
                    {live ? validitySummary(deal) : null}
                    {live ? ' · ' : null}
                    {deal.assigned_count} {deal.assigned_count === 1 ? 'package' : 'packages'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
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
              </div>
            );
          })}
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
                  <Select
                    value={form.discount_type}
                    onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as DealDiscountType }))}
                  >
                    <option value="percentage">Percentage off</option>
                    <option value="fixed_amount">Fixed amount off (EGP)</option>
                  </Select>
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
