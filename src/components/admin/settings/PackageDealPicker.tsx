import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import {
  isDealCurrentlyActive,
  useAdminDeals,
  type DealDiscountType,
} from '@/hooks/useAdminDeals';
import { formatQueryError } from '@/lib/utils';

const CUSTOM_FORM_DEFAULT = { discount_type: 'percentage' as DealDiscountType, discount_value: 10, ends_at: '' };

/**
 * Lets a package editor assign one of the nursery's existing deals, or spin up a one-off custom
 * discount inline (still stored as an ordinary `deals` row — just not meant to be reused).
 */
export function PackageDealPicker({
  nurseryId,
  dealId,
  onChange,
}: {
  nurseryId: string | null | undefined;
  dealId: string | null;
  onChange: (dealId: string | null) => void;
}) {
  const { query, create } = useAdminDeals(nurseryId);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customForm, setCustomForm] = useState(CUSTOM_FORM_DEFAULT);

  const deals = query.data ?? [];
  const selectedDeal = deals.find((d) => d.id === dealId) ?? null;

  const submitCustom = async () => {
    if (!customForm.discount_value || customForm.discount_value <= 0) {
      toast.error('Enter a discount value greater than zero.');
      return;
    }
    try {
      const endsAt = customForm.ends_at ? new Date(customForm.ends_at).toISOString() : null;
      const created = await create.mutateAsync({
        name_ar: 'خصم مخصص',
        name_en: 'Custom discount',
        description_ar: null,
        description_en: null,
        discount_type: customForm.discount_type,
        discount_value: customForm.discount_value,
        starts_at: null,
        ends_at: endsAt,
        active: true,
      });
      onChange(created.id);
      setCreatingCustom(false);
      setCustomForm(CUSTOM_FORM_DEFAULT);
      toast.success('Custom discount created and assigned.');
    } catch (error) {
      toast.error('Could not create the discount.', { description: formatQueryError(error) });
    }
  };

  if (!creatingCustom) {
    return (
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <Label>Assign an existing deal</Label>
          {query.isLoading ? (
            <p className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface-variant">
              <MaterialSymbol name="progress_activity" size="text-base" className="animate-spin" />
              Loading deals…
            </p>
          ) : query.isError ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs leading-5 text-error">
              <MaterialSymbol name="error" size="text-sm" className="mt-0.5 shrink-0" />
              Could not load deals: {formatQueryError(query.error)}
            </p>
          ) : (
            <FilterMenu<string>
              value={dealId ?? ''}
              onChange={(value) => onChange(value || null)}
              options={[
                { value: '', label: 'No discount' },
                ...deals.map((deal) => ({
                  value: deal.id,
                  label:
                    (deal.name_en || deal.name_ar) +
                    (deal.discount_type === 'percentage' ? ` — ${deal.discount_value}% off` : ` — EGP ${deal.discount_value} off`) +
                    (isDealCurrentlyActive(deal) ? '' : ' (inactive)'),
                })),
              ]}
            />
          )}
          {!query.isLoading && !query.isError && deals.length === 0 ? (
            <p className="text-xs text-on-surface-variant">
              No deals created yet — create one below, or from the Deals &amp; Discounts page.
            </p>
          ) : null}
        </div>
        {selectedDeal && !isDealCurrentlyActive(selectedDeal) ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
            <MaterialSymbol name="warning" size="text-sm" className="mt-0.5 shrink-0" />
            This deal is inactive or outside its time window — it won't apply until that changes.
          </p>
        ) : null}
        <div className="border-t border-dashed border-outline-variant pt-2.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setCreatingCustom(true)}>
            <MaterialSymbol name="sell" size="text-base" />
            Create a custom discount for this package
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex items-center gap-2 border-b border-primary/20 pb-2.5">
        <MaterialSymbol name="sell" size="text-base" className="text-primary" />
        <h4 className="text-sm font-semibold text-on-surface">New custom discount</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Discount type</Label>
          <FilterMenu<DealDiscountType>
            value={customForm.discount_type}
            onChange={(discount_type) => setCustomForm((f) => ({ ...f, discount_type }))}
            options={[
              { value: 'percentage', label: 'Percentage off', icon: 'percent' },
              { value: 'fixed_amount', label: 'Fixed amount off (EGP)', icon: 'payments' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{customForm.discount_type === 'percentage' ? 'Discount (%)' : 'Discount (EGP)'}</Label>
          <Input
            type="number"
            min={0}
            max={customForm.discount_type === 'percentage' ? 100 : undefined}
            step={customForm.discount_type === 'percentage' ? 1 : 0.01}
            value={customForm.discount_value}
            onChange={(e) => setCustomForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Counter ends at (optional)</Label>
        <Input
          type="datetime-local"
          className="bg-surface"
          value={customForm.ends_at}
          onChange={(e) => setCustomForm((f) => ({ ...f, ends_at: e.target.value }))}
        />
        <p className="text-xs text-on-surface-variant">
          Shown to parents as a live countdown while they apply. Leave blank for no expiry.
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-primary/20 pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setCreatingCustom(false)}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={create.isPending} onClick={() => void submitCustom()}>
          {create.isPending ? 'Creating…' : 'Create & assign'}
        </Button>
      </div>
    </div>
  );
}
