import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import type { KitchenItem } from '@/features/food-and-beverage/kitchen';
import { cn } from '@/lib/utils';

import { ChildSearch } from './ChildSearch';
import { DISCOUNT_AUDIENCES, discountIssues, type DiscountDraft, type DiscountField, type KitchenDiscount, type StaffPerson } from './kitchenSales';
import { kitchenErrorKey, saveKitchenDiscount, type KitchenChild } from './kitchenSalesApi';
import { useKitchenSale } from './useKitchenSales';

const AUDIENCE_ICON = { all_staff: 'groups', all_children: 'diversity_3', staff_member: 'badge', child: 'child_care' } as const;

/** Adding or changing a kitchen discount: who it is for, on which item, how much, and when. */
export function DiscountDialog({
  nurseryId,
  discount,
  staff,
  items,
  onClose,
}: {
  nurseryId: string;
  discount: KitchenDiscount | null;
  staff: StaffPerson[];
  items: KitchenItem[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [draft, setDraft] = useState<DiscountDraft>(() =>
    discount
      ? {
          nameAr: discount.nameAr, nameEn: discount.nameEn, audience: discount.audience, personId: discount.personId ?? '', itemId: discount.itemId ?? '',
          percent: String(discount.percent), startsOn: discount.startsOn ?? '', endsOn: discount.endsOn ?? '', active: discount.active,
        }
      : { nameAr: '', nameEn: '', audience: 'all_staff', personId: '', itemId: '', percent: '', startsOn: '', endsOn: '', active: true },
  );
  const [child, setChild] = useState<KitchenChild | null>(() =>
    discount?.audience === 'child' && discount.personId
      ? { id: discount.personId, nameAr: discount.personAr ?? '', nameEn: discount.personEn ?? '', classAr: null, classEn: null }
      : null,
  );
  const [touched, setTouched] = useState<Partial<Record<DiscountField, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const issues = discountIssues(draft);
  const save = useKitchenSale(() => saveKitchenDiscount(nurseryId, discount?.id ?? null, draft));
  const set = (patch: Partial<DiscountDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const err = (field: DiscountField) => ((tried || touched[field]) && issues[field] ? t(`kitchenSales.issues.${issues[field]}`) : null);
  const blur = (field: DiscountField) => () => setTouched((s) => ({ ...s, [field]: true }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(issues).length || save.isPending) return;
    setProblem(null);
    try {
      await save.mutateAsync(undefined);
      toast.success(t('kitchenSales.discounts.saved'));
      onClose();
    } catch (error) {
      setProblem(t(kitchenErrorKey(error)));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto" data-testid="discount-dialog">
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{discount ? t('kitchenSales.discounts.edit') : t('kitchenSales.discounts.add')}</DialogTitle>
            <DialogDescription>{t('kitchenSales.discounts.hint')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="discount-name-ar" label={t('kitchenSales.discounts.nameAr')} error={err('nameAr')}>
              <Input id="discount-name-ar" dir="rtl" value={draft.nameAr} onChange={(e) => set({ nameAr: e.target.value })} onBlur={blur('nameAr')} className={cn(err('nameAr') && invalidFieldClass)} />
            </FormField>
            <FormField id="discount-name-en" label={t('kitchenSales.discounts.nameEn')} error={err('nameEn')}>
              <Input id="discount-name-en" dir="ltr" value={draft.nameEn} onChange={(e) => set({ nameEn: e.target.value })} onBlur={blur('nameEn')} className={cn(err('nameEn') && invalidFieldClass)} />
            </FormField>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-on-surface">{t('kitchenSales.discounts.forWho')}</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('kitchenSales.discounts.forWho')}>
              {DISCOUNT_AUDIENCES.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={draft.audience === a}
                  onClick={() => { set({ audience: a, personId: '' }); setChild(null); }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start text-sm font-medium transition-colors',
                    draft.audience === a ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface hover:border-primary/60',
                  )}
                >
                  <MaterialSymbol name={AUDIENCE_ICON[a]} size="text-lg" />
                  {t(`kitchenSales.discounts.audiences.${a}`)}
                </button>
              ))}
            </div>
          </fieldset>

          {draft.audience === 'staff_member' ? (
            <FormField id="discount-staff" label={t('kitchenSales.charge.whichStaff')} error={err('personId')}>
              <Select id="discount-staff" value={draft.personId} onChange={(e) => set({ personId: e.target.value })} onBlur={blur('personId')} className={cn(err('personId') && invalidFieldClass)}>
                <option value="">{t('kitchenSales.charge.chooseStaff')}</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{(isArabic ? s.nameAr || s.nameEn : s.nameEn || s.nameAr) || '—'}</option>)}
              </Select>
            </FormField>
          ) : draft.audience === 'child' ? (
            <FormField id="discount-child" label={t('kitchenSales.charge.whichChild')} error={err('personId')}>
              <ChildSearch id="discount-child" nurseryId={nurseryId} value={child} onChange={(c) => { setChild(c); set({ personId: c?.id ?? '' }); }} invalid={Boolean(err('personId'))} />
            </FormField>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="discount-item" label={t('kitchenSales.discounts.item')} hint={t('kitchenSales.discounts.itemHint')}>
              <Select id="discount-item" value={draft.itemId} onChange={(e) => set({ itemId: e.target.value })}>
                <option value="">{t('kitchenSales.discounts.allItems')}</option>
                {items.filter((i) => i.childPrice !== null || i.staffPrice !== null).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </FormField>
            <FormField id="discount-percent" label={t('kitchenSales.discounts.percent')} error={err('percent')}>
              <div className="relative">
                <Input id="discount-percent" inputMode="decimal" dir="ltr" value={draft.percent} onChange={(e) => set({ percent: e.target.value.replace(/[^\d.]/g, '') })}
                  onBlur={blur('percent')} className={cn('pe-8', err('percent') && invalidFieldClass)} />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">%</span>
              </div>
            </FormField>
            <FormField id="discount-from" label={t('kitchenSales.discounts.from')} optional>
              <Input id="discount-from" type="date" value={draft.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
            </FormField>
            <FormField id="discount-to" label={t('kitchenSales.discounts.to')} optional error={err('endsOn')}>
              <Input id="discount-to" type="date" value={draft.endsOn} min={draft.startsOn || undefined} onChange={(e) => set({ endsOn: e.target.value })} onBlur={blur('endsOn')} className={cn(err('endsOn') && invalidFieldClass)} />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm text-on-surface">
            <Checkbox checked={draft.active} onCheckedChange={(v) => set({ active: v === true })} />
            {t('kitchenSales.discounts.active')}
          </label>

          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
