import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { COMMON_UNITS, EXTRA_KINDS, itemDraft, itemIssues, KITCHEN_CATEGORIES, type ItemDraft, type ItemField, type KitchenCategory, type KitchenItem } from './kitchen';
import { fnbErrorKey, saveKitchenItem } from './mealPlansApi';
import { FOOD_ALLERGENS } from './menu';
import { useKitchenChange } from './useMealPlansAndKitchen';

const EXTRA_ICON = { meal: 'lunch_dining', drink: 'local_cafe', snack: 'cookie' } as const;

/**
 * Adding a kitchen item (it starts at 0; restock it after) or changing it: what it is, when to
 * reorder, and how it is sold: the price for children and for staff, what it costs, the pack it
 * comes in, whether parents and teachers see it as an extra on the menu, and the foods it contains
 * (an extra is never given to a child allergic to one of them).
 */
export function KitchenItemDialog({ nurseryId, item, onClose }: { nurseryId: string; item: KitchenItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ItemDraft>(() => itemDraft(item));
  const [touched, setTouched] = useState<Partial<Record<ItemField, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const issues = itemIssues(draft);
  const save = useKitchenChange(nurseryId, () => saveKitchenItem({ nurseryId, id: item?.id ?? null, draft }));
  const set = (patch: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const blur = (field: ItemField) => () => setTouched((s) => ({ ...s, [field]: true }));
  const err = (field: ItemField) => ((tried || touched[field]) && issues[field] ? t(`fnb.kitchen.issues.${issues[field]}`) : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(issues).length || save.isPending) return;
    setProblem(null);
    try {
      await save.mutateAsync(undefined);
      toast.success(t('fnb.kitchen.itemSaved'));
      onClose();
    } catch (error) {
      setProblem(t(fnbErrorKey(error)));
    }
  };

  const money = (field: 'unitCost' | 'childPrice' | 'staffPrice', id: string, label: string, hint?: string) => (
    <FormField id={id} label={label} optional error={err(field)} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          dir="ltr"
          value={draft[field]}
          onChange={(e) => set({ [field]: e.target.value.replace(/[^\d.]/g, '') } as Partial<ItemDraft>)}
          onBlur={blur(field)}
          aria-invalid={Boolean(err(field))}
          className={cn('pe-14', err(field) && invalidFieldClass)}
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">{t('kitchenSales.currency')}</span>
      </div>
    </FormField>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="kitchen-item-dialog">
        <form className="space-y-5" onSubmit={(e) => void submit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>{item ? t('fnb.kitchen.editItem') : t('fnb.kitchen.newItem')}</DialogTitle>
            <DialogDescription>{item ? t('fnb.kitchen.editItemHint') : t('fnb.kitchen.newItemHint')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="kitchen-name" label={t('fnb.kitchen.name')} error={err('name')} className="sm:col-span-2">
              <Input id="kitchen-name" autoFocus value={draft.name} placeholder={t('fnb.kitchen.namePlaceholder')} aria-invalid={Boolean(err('name'))}
                className={cn(err('name') && invalidFieldClass)} onChange={(e) => set({ name: e.target.value })} onBlur={blur('name')} />
            </FormField>
            <FormField id="kitchen-category" label={t('fnb.kitchen.category')}>
              <Select id="kitchen-category" value={draft.category} onChange={(e) => set({ category: e.target.value as KitchenCategory })}>
                {KITCHEN_CATEGORIES.map((c) => <option key={c} value={c}>{t(`fnb.kitchen.categories.${c}`)}</option>)}
              </Select>
            </FormField>
            <FormField id="kitchen-unit" label={t('fnb.kitchen.unit')} error={err('unit')} hint={t('kitchenSales.item.unitHint')}>
              <Input id="kitchen-unit" list="kitchen-units" value={draft.unit} aria-invalid={Boolean(err('unit'))}
                className={cn(err('unit') && invalidFieldClass)} onChange={(e) => set({ unit: e.target.value })} onBlur={blur('unit')} />
              <datalist id="kitchen-units">{COMMON_UNITS.map((u) => <option key={u} value={t(`fnb.kitchen.units.${u}`)} />)}</datalist>
            </FormField>
            <FormField id="kitchen-low" label={t('fnb.kitchen.lowLevel')} error={err('lowStockLevel')} hint={t('fnb.kitchen.lowLevelHint')}>
              <Input id="kitchen-low" inputMode="decimal" value={draft.lowStockLevel} aria-invalid={Boolean(err('lowStockLevel'))}
                className={cn(err('lowStockLevel') && invalidFieldClass)} onChange={(e) => set({ lowStockLevel: e.target.value.replace(/[^\d.]/g, '') })} onBlur={blur('lowStockLevel')} />
            </FormField>
            <FormField id="kitchen-expiry" label={t('fnb.kitchen.expiry')} optional>
              <Input id="kitchen-expiry" type="date" value={draft.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
            </FormField>
          </div>

          <fieldset className="space-y-3 rounded-xl border border-outline-variant p-4">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-on-surface">
              <MaterialSymbol name="sell" size="text-base" className="text-primary" />
              {t('kitchenSales.item.selling')}
            </legend>
            <p className="text-xs text-on-surface-variant">{t('kitchenSales.item.sellingHint', { unit: draft.unit || t('kitchenSales.item.unitWord') })}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {money('childPrice', 'kitchen-child-price', t('kitchenSales.item.childPrice'))}
              {money('staffPrice', 'kitchen-staff-price', t('kitchenSales.item.staffPrice'), t('kitchenSales.item.staffPriceHint'))}
              {money('unitCost', 'kitchen-cost', t('kitchenSales.item.cost'))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="kitchen-pack-size" label={t('kitchenSales.item.packSize', { unit: draft.unit || t('kitchenSales.item.unitWord') })} optional error={err('packSize')}>
                <Input id="kitchen-pack-size" inputMode="decimal" dir="ltr" value={draft.packSize} placeholder="12" aria-invalid={Boolean(err('packSize'))}
                  className={cn(err('packSize') && invalidFieldClass)} onChange={(e) => set({ packSize: e.target.value.replace(/[^\d.]/g, '') })} onBlur={blur('packSize')} />
              </FormField>
              <FormField id="kitchen-pack-unit" label={t('kitchenSales.item.packUnit')} optional error={err('packUnit')}>
                <Input id="kitchen-pack-unit" value={draft.packUnit} placeholder={t('kitchenSales.item.packUnitPlaceholder')} aria-invalid={Boolean(err('packUnit'))}
                  className={cn(err('packUnit') && invalidFieldClass)} onChange={(e) => set({ packUnit: e.target.value })} onBlur={blur('packUnit')} />
              </FormField>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-on-surface">{t('kitchenSales.item.extraKind')}</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('kitchenSales.item.extraKind')}>
                {(['', ...EXTRA_KINDS] as const).map((kind) => (
                  <button
                    key={kind || 'none'}
                    type="button"
                    role="radio"
                    aria-checked={draft.extraKind === kind}
                    onClick={() => set({ extraKind: kind })}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      draft.extraKind === kind ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant text-on-surface hover:border-primary/60',
                    )}
                  >
                    {kind ? <MaterialSymbol name={EXTRA_ICON[kind]} size="text-base" /> : null}
                    {kind ? t(`kitchenSales.kinds.${kind}`) : t('kitchenSales.item.notExtra')}
                  </button>
                ))}
              </div>
              {err('extraKind') ? <p id="kitchen-extra-error" role="alert" className="text-xs text-error">{err('extraKind')}</p> : <p className="text-xs text-on-surface-variant">{t('kitchenSales.item.extraHint')}</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-on-surface">{t('kitchenSales.item.contains')}</p>
              <div className="flex flex-wrap gap-1.5">
                {FOOD_ALLERGENS.map((food) => {
                  const on = draft.foodAllergens.includes(food);
                  return (
                    <button
                      key={food}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ foodAllergens: on ? draft.foodAllergens.filter((f) => f !== food) : FOOD_ALLERGENS.filter((f) => f === food || draft.foodAllergens.includes(f)) })}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        on ? 'border-error bg-error/10 text-error' : 'border-outline-variant text-on-surface-variant hover:border-error/50',
                      )}
                    >
                      {on ? <MaterialSymbol name="warning" size="text-sm" /> : null}
                      {t(`fnb.allergens.${food}`)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-on-surface-variant">{t('kitchenSales.item.containsHint')}</p>
            </div>
          </fieldset>

          <FormProblem message={problem} />
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>{save.isPending ? t('fnb.editor.saving') : t('fnb.kitchen.saveItem')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
