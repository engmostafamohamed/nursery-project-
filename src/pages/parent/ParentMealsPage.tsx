import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useMealPlans } from '@/hooks/useMealPlans';
import { useSettings } from '@/lib/useSettings';

export function ParentMealsPage() {
  const { t } = useTranslation();
  const { nurseryId } = useSettings();
  const meals = useMealPlans(nurseryId ?? undefined);
  const currentWeek = useMemo(() => meals.plans[0] ?? null, [meals.plans]);
  const menu = (currentWeek?.meals_json as Record<string, unknown> | undefined) ?? {};

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-on-surface">{t('meals.parentTitle')}</h1>
      {!currentWeek ? (
        <p className="text-sm text-on-surface-variant">{t('meals.noPlan')}</p>
      ) : (
        <section className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <p className="text-sm font-medium">{t('meals.weekOf')}: {String(currentWeek.week_start_date)}</p>
          {(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const).map((day) => (
            <div key={day} className="rounded-lg border border-outline-variant bg-surface text-foreground p-2 text-sm">
              <strong>{t(`meals.days.${day}`)}:</strong> {String(menu[day] ?? '-')}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
