import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { DailyReportFormData, MealAmount } from '@/hooks/dailyReportsSchema';

type Props = {
  value: DailyReportFormData['meals'];
  onChange: (value: DailyReportFormData['meals']) => void;
};

const amounts: MealAmount[] = ['none', 'some', 'all'];

export function MealsSection({ value, onChange }: Props) {
  const { t } = useTranslation();
  const updateMeal = (meal: 'breakfast' | 'lunch' | 'snacks', key: 'amount' | 'notes', val: string) => {
    onChange({
      ...value,
      [meal]: {
        ...value[meal],
        [key]: key === 'amount' ? (val as MealAmount) : val,
      },
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('reports.daily.sections.meals')}</h2>
      {(['breakfast', 'lunch', 'snacks'] as const).map((meal) => (
        <div key={meal} className="grid gap-2 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t(`reports.daily.meals.${meal}`)}</Label>
            <select
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
              value={value[meal].amount}
              onChange={(e) => updateMeal(meal, 'amount', e.target.value)}
            >
              {amounts.map((o) => (
                <option key={o} value={o}>
                  {t(`reports.daily.options.mealAmount.${o}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t('reports.daily.notesOptional')}</Label>
            <Input value={value[meal].notes} onChange={(e) => updateMeal(meal, 'notes', e.target.value)} />
          </div>
        </div>
      ))}
    </section>
  );
}
