import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { FOOD_ALLERGENS, type FoodAllergen } from './menu';

/** What a dish contains, as small labels; the ones a child here reacts to stand out. */
export function AllergenChips({ allergens, highlight = [], className }: { allergens: FoodAllergen[]; highlight?: FoodAllergen[]; className?: string }) {
  const { t } = useTranslation();
  if (!allergens.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1', className)} aria-label={t('fnb.allergens.contains')}>
      {allergens.map((code) => {
        const danger = highlight.includes(code);
        return (
          <li
            key={code}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
              danger ? 'bg-error/10 text-error ring-1 ring-error/40' : 'bg-surface-high text-on-surface-variant',
            )}
          >
            {danger ? <MaterialSymbol name="warning" size="text-xs" /> : null}
            {t(`fnb.allergens.${code}`)}
          </li>
        );
      })}
    </ul>
  );
}

/** Toggles for what a dish contains; each shows how many children here react to it. */
export function AllergenPicker({
  value,
  onChange,
  counts,
  idPrefix,
}: {
  value: FoodAllergen[];
  onChange: (next: FoodAllergen[]) => void;
  counts: Partial<Record<FoodAllergen, number>>;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('fnb.allergens.contains')} className="flex flex-wrap gap-1.5" id={idPrefix}>
      {FOOD_ALLERGENS.map((code) => {
        const on = value.includes(code);
        const count = counts[code] ?? 0;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((c) => c !== code) : [...value, code])}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
              on
                ? count > 0
                  ? 'border-error bg-error/10 text-error'
                  : 'border-primary bg-primary/10 text-primary'
                : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-lowest',
            )}
          >
            {on ? <MaterialSymbol name="check" size="text-sm" /> : null}
            {t(`fnb.allergens.${code}`)}
            {count > 0 ? (
              <span className="rounded-full bg-error/15 px-1.5 text-[10px] font-bold text-error" title={t('fnb.allergens.childrenCount', { count })}>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
