import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

import { MealIcons } from './MealIcons';
import { localName } from './menu';
import type { MealPlan, MealPlanChild } from './mealPlans';
import { fnbErrorKey, setChildMealPlan } from './mealPlansApi';
import { useMealPlanChange } from './useMealPlansAndKitchen';

/**
 * Giving a child a meal plan (from today), changing it, or stopping it; and whether the tuition
 * package already includes it. Says when the meal line will be billed, or why it will not be.
 */
export function ChildMealPlanDialog({ nurseryId, child, plans, onClose }: { nurseryId: string; child: MealPlanChild; plans: MealPlan[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const money = (n: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(n) });
  const [planId, setPlanId] = useState<string | null>(child.current?.mealPlanId ?? null);
  const [included, setIncluded] = useState(child.current ? !child.current.charged : false);
  const offered = plans.filter((p) => p.active || p.id === child.current?.mealPlanId);
  const save = useMealPlanChange(nurseryId, () => setChildMealPlan(child.childId, planId, !included));
  const chosen = offered.find((p) => p.id === planId) ?? null;
  const unchanged = planId === (child.current?.mealPlanId ?? null) && (!planId || included === !child.current?.charged);

  const submit = async () => {
    try {
      await save.mutateAsync(undefined);
      toast.success(planId ? t('fnb.plans.childSaved') : t('fnb.plans.childStopped'));
      onClose();
    } catch (error) {
      toast.error(t(fnbErrorKey(error)));
    }
  };

  const option = (selected: boolean) =>
    cn(
      'flex w-full items-center gap-3 rounded-xl border p-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
      selected ? 'border-primary bg-primary/5' : 'border-outline-variant hover:bg-surface-container-lowest',
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fnb.plans.childTitle', { name: localName(child.nameAr, child.nameEn, isArabic) })}</DialogTitle>
          <DialogDescription>{t('fnb.plans.childHint')}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label={t('fnb.plans.title')} className="space-y-2">
          {offered.map((plan) => (
            <button key={plan.id} type="button" role="radio" aria-checked={planId === plan.id} className={option(planId === plan.id)} onClick={() => setPlanId(plan.id)}>
              <MaterialSymbol name={planId === plan.id ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-primary" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-sm font-semibold text-on-surface">{localName(plan.nameAr, plan.nameEn, isArabic)}</span>
                <MealIcons meals={plan.meals} compact />
              </span>
              <span className="shrink-0 text-sm font-bold text-on-surface">{t('fnb.plans.pricePerMonth', { amount: money(plan.monthlyPrice) })}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={planId === null} className={option(planId === null)} onClick={() => setPlanId(null)}>
            <MaterialSymbol name={planId === null ? 'radio_button_checked' : 'radio_button_unchecked'} className="text-primary" />
            <span className="text-sm font-medium text-on-surface">{t('fnb.plans.noPlan')}</span>
          </button>
        </div>

        {planId ? (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <Checkbox checked={included} onCheckedChange={(v) => setIncluded(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium text-on-surface">{t('fnb.plans.included')}</span>
              <span className="block text-xs text-on-surface-variant">{t('fnb.plans.includedHint')}</span>
            </span>
          </label>
        ) : null}

        {chosen && !included ? (
          child.hasTuition ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs text-on-surface">
              <MaterialSymbol name="receipt_long" size="text-base" className="mt-px text-primary" />
              {t('fnb.plans.billingNote', { amount: money(chosen.monthlyPrice) })}
            </p>
          ) : (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-on-surface">
              <MaterialSymbol name="warning" size="text-base" className="mt-px text-warning" />
              {t('fnb.plans.noTuitionNote')}
            </p>
          )
        ) : null}

        <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => void submit()} disabled={unchanged || save.isPending} aria-busy={save.isPending}>
            {save.isPending ? t('fnb.editor.saving') : t('fnb.plans.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
