import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { MealToggles } from './MealIcons';
import { mealPlanIssues, PLAN_NAME_MAX, PLAN_PRICE_MAX, type MealPlan, type MealPlanDraft } from './mealPlans';
import { fnbErrorKey, saveMealPlan } from './mealPlansApi';
import { useMealPlanChange } from './useMealPlansAndKitchen';

/**
 * Adding or changing a meal plan the nursery offers: its name in both languages, its meals and its
 * monthly price. A new price applies to children given the plan afterwards; problems show under
 * each field as they are typed.
 */
export function MealPlanDialog({ nurseryId, plan, onClose }: { nurseryId: string; plan: MealPlan | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<MealPlanDraft>(() =>
    plan
      ? { nameAr: plan.nameAr, nameEn: plan.nameEn, meals: plan.meals, price: String(plan.monthlyPrice), active: plan.active }
      : { nameAr: '', nameEn: '', meals: ['breakfast', 'lunch', 'snacks'], price: '', active: true },
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const issues = mealPlanIssues(draft);
  const save = useMealPlanChange(nurseryId, () =>
    saveMealPlan({ nurseryId, id: plan?.id ?? null, nameAr: draft.nameAr, nameEn: draft.nameEn, meals: draft.meals, monthlyPrice: Number(draft.price), active: draft.active }),
  );
  const shown = (field: keyof typeof issues) => (tried || touched[field]) && issues[field];
  const set = (patch: Partial<MealPlanDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const touch = (field: string) => setTouched((s) => ({ ...s, [field]: true }));

  const submit = async () => {
    setTried(true);
    if (Object.keys(issues).length) return;
    try {
      await save.mutateAsync(undefined);
      toast.success(t('fnb.plans.saved'));
      onClose();
    } catch (error) {
      toast.error(t(fnbErrorKey(error)));
    }
  };

  const error = (field: keyof typeof issues, id: string) =>
    shown(field) ? (
      <p id={`${id}-error`} role="alert" className="text-xs text-error">
        {t(`fnb.plans.issues.${issues[field]}`, { max: field === 'price' ? PLAN_PRICE_MAX : PLAN_NAME_MAX })}
      </p>
    ) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? t('fnb.plans.editTitle') : t('fnb.plans.newTitle')}</DialogTitle>
          <DialogDescription>{t('fnb.plans.dialogHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-name-ar">{t('fnb.plans.nameAr')}</Label>
              <Input id="plan-name-ar" dir="rtl" value={draft.nameAr} aria-invalid={Boolean(shown('nameAr'))} aria-describedby={shown('nameAr') ? 'plan-name-ar-error' : undefined}
                className={cn(shown('nameAr') && 'border-error')} onChange={(e) => set({ nameAr: e.target.value })} onBlur={() => touch('nameAr')} />
              {error('nameAr', 'plan-name-ar')}
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-name-en">{t('fnb.plans.nameEn')}</Label>
              <Input id="plan-name-en" dir="ltr" value={draft.nameEn} aria-invalid={Boolean(shown('nameEn'))} aria-describedby={shown('nameEn') ? 'plan-name-en-error' : undefined}
                className={cn(shown('nameEn') && 'border-error')} onChange={(e) => set({ nameEn: e.target.value })} onBlur={() => touch('nameEn')} />
              {error('nameEn', 'plan-name-en')}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-on-surface">{t('fnb.plans.meals')}</p>
            <MealToggles value={draft.meals} invalid={Boolean(shown('meals'))} onChange={(meals) => { set({ meals }); touch('meals'); }} />
            {error('meals', 'plan-meals')}
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-price">{t('fnb.plans.price')}</Label>
            <div className="relative">
              <Input id="plan-price" inputMode="decimal" value={draft.price} aria-invalid={Boolean(shown('price'))} aria-describedby={shown('price') ? 'plan-price-error' : 'plan-price-hint'}
                className={cn('pe-20', shown('price') && 'border-error')} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, '') })} onBlur={() => touch('price')} />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">{t('fnb.plans.perMonth')}</span>
            </div>
            {error('price', 'plan-price') ?? (
              <p id="plan-price-hint" className="text-xs text-on-surface-variant">{plan ? t('fnb.plans.priceChangeHint') : t('fnb.plans.priceHint')}</p>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={draft.active} onCheckedChange={(v) => set({ active: v === true })} className="mt-0.5" />
            <span>
              <span className="font-medium text-on-surface">{t('fnb.plans.active')}</span>
              <span className="block text-xs text-on-surface-variant">{t('fnb.plans.activeHint')}</span>
            </span>
          </label>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>{save.isPending ? t('fnb.editor.saving') : t('fnb.plans.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
