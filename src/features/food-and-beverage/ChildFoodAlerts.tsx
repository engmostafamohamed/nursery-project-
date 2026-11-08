import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { MEALS, severityRank, severityTone } from './menu';
import { useFoodAlerts } from './useMenuWeek';

/**
 * In a child's daily report: today's dishes this child must not eat, so the teacher answering the
 * meal questions sees it. Nothing shows when there is nothing to warn about.
 */
export function ChildFoodAlerts({ nurseryId, childId, day, menuPath }: { nurseryId: string | null | undefined; childId: string; day: string; menuPath: string }) {
  const { t } = useTranslation();
  const query = useFoodAlerts({ nurseryId, from: day, to: day, childId });
  const items = [...(query.data?.conflicts ?? [])].sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  if (!items.length) return null;
  const worst = items.reduce((w, c) => (severityRank(c.severity) < severityRank(w) ? c.severity : w), items[0].severity);
  const tone = severityTone(worst);

  return (
    <section
      role="alert"
      data-testid="child-food-alert"
      className={cn('rounded-xl border p-3 text-sm', tone === 'error' ? 'border-error/50 bg-error/5' : 'border-warning/50 bg-warning/5')}
    >
      <p className={cn('flex items-center gap-1.5 font-semibold', tone === 'error' ? 'text-error' : 'text-warning')}>
        <MaterialSymbol name="no_food" size="text-lg" />
        {t('fnb.report.title')}
      </p>
      <ul className="mt-1 space-y-0.5 text-on-surface">
        {items.map((c) => (
          <li key={`${c.dishId}-${c.allergen}`}>
            {t('fnb.alerts.item', { meal: t(`fnb.meals.${c.meal}`), dish: c.dishName, allergen: t(`fnb.allergens.${c.allergen}`) })}
            {!c.eatsNurseryMeals ? <span className="text-on-surface-variant"> · {t('fnb.ownFood')}</span> : null}
          </li>
        ))}
      </ul>
      {items[0].treatment ? <p className="mt-1 text-xs text-on-surface-variant">{t('fnb.alerts.treatment')}: {items[0].treatment}</p> : null}
      <Link to={menuPath} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
        {t('fnb.report.seeMenu')}
      </Link>
    </section>
  );
}
