import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { AllergenChips } from './AllergenChips';
import type { FoodAllergen } from './menu';

/**
 * One dish on the board: its name, what it contains, and, when a child here must not eat it, a red
 * edge and the reason underneath. With `onEdit` the whole card opens it for editing.
 */
export function DishTile({
  name,
  allergens,
  danger = [],
  warning,
  onEdit,
}: {
  name: string;
  allergens: FoodAllergen[];
  /** The allergens a child here reacts to; drawn in red. */
  danger?: FoodAllergen[];
  /** The children it is not safe for, under the name. */
  warning?: ReactNode;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const risky = danger.length > 0;
  const body = (
    <>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-on-surface">{name}</span>
        {onEdit ? <MaterialSymbol name="edit" size="text-base" className="shrink-0 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" /> : null}
      </span>
      {allergens.length ? <AllergenChips allergens={allergens} highlight={danger} className="mt-1.5" /> : null}
      {warning ? <span className="mt-1.5 block">{warning}</span> : null}
    </>
  );
  const look = cn(
    'group block w-full rounded-xl border bg-surface p-2.5 text-start shadow-sm',
    risky ? 'border-error/40 border-s-4 border-s-error' : 'border-outline-variant',
  );
  return onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      aria-label={t('fnb.editor.editDish', { name })}
      data-testid="dish-tile"
      className={cn(look, 'outline-none transition-colors hover:border-primary/50 hover:bg-surface-container-lowest focus-visible:ring-2 focus-visible:ring-primary')}
    >
      {body}
    </button>
  ) : (
    <div className={look} data-testid="dish-tile">
      {body}
    </div>
  );
}

/** "Not safe for N" with each child, as a dish tile shows it. */
export function DishWarning({ lines }: { lines: Array<{ key: string; text: string; strong: boolean; ownFood: boolean }> }) {
  const { t } = useTranslation();
  if (!lines.length) return null;
  return (
    <span className="block space-y-0.5" data-testid="dish-warning">
      {lines.map((line) => (
        <span key={line.key} className={cn('flex items-start gap-1 text-[11px] font-semibold leading-4', line.strong ? 'text-error' : 'text-warning')}>
          <MaterialSymbol name="warning" size="text-xs" className="mt-px" />
          <span>
            {line.text}
            {line.ownFood ? <span className="font-normal text-on-surface-variant"> · {t('fnb.ownFood')}</span> : null}
          </span>
        </span>
      ))}
    </span>
  );
}
