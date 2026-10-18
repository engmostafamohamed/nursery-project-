import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FilterMenu } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { isDealCurrentlyActive, useAdminDeals, type DealDiscountType } from '@/hooks/useAdminDeals';
import { discountValueIssue } from '@/lib/packageForms';
import { cn, formatQueryError } from '@/lib/utils';
import { dealDiscountLabel, localizedName } from './dealLabels';

const CUSTOM_FORM_DEFAULT = { discount_type: 'percentage' as DealDiscountType, discount_value: 10, ends_at: '' };

/**
 * Lets a package editor assign one of the nursery's existing deals, or spin up a one-off custom
 * discount inline (still stored as an ordinary `deals` row — just not meant to be reused). The
 * editor is told about each custom discount it creates, so it can delete the unused ones.
 */
export function PackageDealPicker({
  nurseryId,
  dealId,
  onChange,
  onCustomDealCreated,
}: {
  nurseryId: string | null | undefined;
  dealId: string | null;
  onChange: (dealId: string | null) => void;
  onCustomDealCreated?: (dealId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { query, create } = useAdminDeals(nurseryId);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customForm, setCustomForm] = useState(CUSTOM_FORM_DEFAULT);

  const deals = query.data ?? [];
  const selectedDeal = deals.find((d) => d.id === dealId) ?? null;
  // Checked live: over 100% would make the package free, since the discount is capped at the price.
  const valueIssue = discountValueIssue(customForm.discount_type, customForm.discount_value);

  const submitCustom = async () => {
    if (valueIssue) return;
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
      onCustomDealCreated?.(created.id);
      onChange(created.id);
      setCreatingCustom(false);
      setCustomForm(CUSTOM_FORM_DEFAULT);
      toast.success(t('deals.picker.customCreated'));
    } catch (error) {
      toast.error(t('deals.picker.createFailed'), { description: formatQueryError(error) });
    }
  };

  if (!creatingCustom) {
    return (
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <Label>{t('deals.picker.assignExisting')}</Label>
          {query.isLoading ? (
            <p className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface-variant">
              <MaterialSymbol name="progress_activity" size="text-base" className="animate-spin" />
              {t('deals.picker.loading')}
            </p>
          ) : query.isError ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs leading-5 text-error">
              <MaterialSymbol name="error" size="text-sm" className="mt-0.5 shrink-0" />
              {t('deals.picker.loadFailed', { error: formatQueryError(query.error) })}
            </p>
          ) : (
            <FilterMenu<string>
              value={dealId ?? ''}
              onChange={(value) => onChange(value || null)}
              options={[
                { value: '', label: t('deals.picker.noDiscount') },
                ...deals.map((deal) => {
                  const label = t('deals.picker.option', { name: localizedName(deal, isAr), discount: dealDiscountLabel(t, deal) });
                  return { value: deal.id, label: isDealCurrentlyActive(deal) ? label : t('deals.inactiveSuffix', { label }) };
                }),
              ]}
            />
          )}
          {!query.isLoading && !query.isError && deals.length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t('deals.picker.noDealsYet')}</p>
          ) : null}
        </div>
        {selectedDeal && !isDealCurrentlyActive(selectedDeal) ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
            <MaterialSymbol name="warning" size="text-sm" className="mt-0.5 shrink-0" />
            {t('deals.picker.inactiveWarning')}
          </p>
        ) : null}
        <div className="border-t border-dashed border-outline-variant pt-2.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setCreatingCustom(true)}>
            <MaterialSymbol name="sell" size="text-base" />
            {t('deals.picker.createCustom')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
      <div className="flex items-center gap-2 border-b border-primary/20 pb-2.5">
        <MaterialSymbol name="sell" size="text-base" className="text-primary" />
        <h4 className="text-sm font-semibold text-on-surface">{t('deals.picker.customTitle')}</h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('deals.fields.type')}</Label>
          <FilterMenu<DealDiscountType>
            value={customForm.discount_type}
            onChange={(discount_type) => setCustomForm((f) => ({ ...f, discount_type }))}
            options={[
              { value: 'percentage', label: t('deals.types.percentage'), icon: 'percent' },
              { value: 'fixed_amount', label: t('deals.types.fixed_amount'), icon: 'payments' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="custom-deal-value">
            {customForm.discount_type === 'percentage' ? t('deals.fields.valuePercent') : t('deals.fields.valueAmount')}
          </Label>
          <Input
            id="custom-deal-value"
            type="number"
            min={0}
            max={customForm.discount_type === 'percentage' ? 100 : undefined}
            step={customForm.discount_type === 'percentage' ? 1 : 0.01}
            value={customForm.discount_value}
            aria-invalid={Boolean(valueIssue)}
            aria-describedby={valueIssue ? 'custom-deal-value-error' : undefined}
            className={cn(valueIssue && invalidFieldClass)}
            onChange={(e) => setCustomForm((f) => ({ ...f, discount_value: Number(e.target.value) || 0 }))}
          />
          <FieldError id="custom-deal-value-error" message={valueIssue ? t(`packageForms.errors.${valueIssue}`) : null} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="custom-deal-ends">{t('deals.picker.counterEnds')}</Label>
        <Input
          id="custom-deal-ends"
          type="datetime-local"
          className="bg-surface"
          value={customForm.ends_at}
          onChange={(e) => setCustomForm((f) => ({ ...f, ends_at: e.target.value }))}
        />
        <p className="text-xs text-on-surface-variant">{t('deals.picker.counterHint')}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-primary/20 pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setCreatingCustom(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="button" size="sm" disabled={create.isPending || Boolean(valueIssue)} onClick={() => void submitCustom()}>
          {create.isPending ? t('deals.picker.creating') : t('deals.picker.createAndAssign')}
        </Button>
      </div>
    </div>
  );
}
