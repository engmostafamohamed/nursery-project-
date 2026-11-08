import { useTranslation } from 'react-i18next';

import { formatMoneyAmount } from '@/lib/money';

import { MealIcons } from './MealIcons';
import { localName } from './menu';
import { useFamilyMealPlans } from './useMealPlansAndKitchen';

/** For a parent: each child's meal plan, the meals it covers and what it costs a month. */
export function FamilyMealPlans() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const query = useFamilyMealPlans(true);
  const rows = query.data ?? [];
  if (!rows.length) return null;
  return (
    <section aria-labelledby="family-meal-plans" className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm" data-testid="family-meal-plans">
      <h2 id="family-meal-plans" className="text-sm font-semibold text-on-surface">{t('fnb.parent.plansTitle')}</h2>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.childId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-container-lowest p-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-on-surface">{localName(row.childNameAr, row.childNameEn, isArabic)}</span>
              <span className="block text-xs text-on-surface-variant">{localName(row.plan.nameAr, row.plan.nameEn, isArabic)}</span>
            </span>
            <MealIcons meals={row.plan.meals} compact />
            <span className="text-sm font-semibold text-on-surface">
              {row.plan.charged
                ? t('fnb.plans.pricePerMonth', { amount: t('invoice.egpAmount', { amount: formatMoneyAmount(row.plan.monthlyPrice) }) })
                : t('fnb.plans.includedShort')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
