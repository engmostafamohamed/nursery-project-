import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { MEAL_LOOK } from './mealLook';
import { MEALS, type Meal } from './menu';

/** The meals a plan covers, as small tinted icons with their names. */
export function MealIcons({ meals, compact = false }: { meals: Meal[]; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={meals.map((m) => t(`fnb.meals.${m}`)).join('، ')}>
      {MEALS.filter((m) => meals.includes(m)).map((meal) => (
        <li key={meal} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', MEAL_LOOK[meal].tint)}>
          <MaterialSymbol name={MEAL_LOOK[meal].icon} size="text-sm" />
          {compact ? null : t(`fnb.meals.${meal}`)}
        </li>
      ))}
    </ul>
  );
}

/** Choosing meals: three toggles, each with its icon. */
export function MealToggles({ value, onChange, invalid }: { value: Meal[]; onChange: (next: Meal[]) => void; invalid?: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="group" className="grid grid-cols-3 gap-2" aria-invalid={invalid}>
      {MEALS.map((meal) => {
        const on = value.includes(meal);
        return (
          <button
            key={meal}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((m) => m !== meal) : MEALS.filter((m) => m === meal || value.includes(m)))}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
              on ? 'border-primary bg-primary/5 text-primary' : invalid ? 'border-error text-on-surface-variant' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-lowest',
            )}
          >
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', MEAL_LOOK[meal].tint)}>
              <MaterialSymbol name={MEAL_LOOK[meal].icon} size="text-lg" />
            </span>
            {t(`fnb.meals.${meal}`)}
            <MaterialSymbol name={on ? 'check_circle' : 'radio_button_unchecked'} size="text-base" />
          </button>
        );
      })}
    </div>
  );
}
