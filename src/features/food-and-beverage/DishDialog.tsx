import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { AllergenPicker } from './AllergenChips';
import { dayLabel, MEAL_LOOK } from './mealLook';
import { DISH_NAME_MAX, dishIssue, dishWarnings, type DraftDish } from './menuDrafts';
import { localName } from '@/lib/bilingualName';
import { severityTone, type FoodAllergen } from './menu';
import type { AllergyIndex } from './menuApi';

/**
 * Adding or editing one dish: its name, what it contains, and, as it is tagged, the children here
 * it is not safe for. "Done" keeps it in the week (saved with "Save menu"); the name is checked
 * under the field.
 */
export function DishDialog({
  dish,
  isNew,
  allergyIndex,
  onDone,
  onDelete,
  onClose,
}: {
  dish: DraftDish;
  isNew: boolean;
  allergyIndex: AllergyIndex;
  onDone: (dish: DraftDish) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const locale = isArabic ? 'ar-EG' : 'en-GB';
  const [name, setName] = useState(dish.name);
  const [allergens, setAllergens] = useState<FoodAllergen[]>(dish.allergens);
  const [tried, setTried] = useState(false);
  const issue = dishIssue({ name });
  const warnings = dishWarnings(allergens, allergyIndex);
  const counts = Object.fromEntries(Object.entries(allergyIndex).map(([code, children]) => [code, children?.length ?? 0])) as Partial<Record<FoodAllergen, number>>;
  const look = MEAL_LOOK[dish.meal];

  const done = () => {
    setTried(true);
    if (issue) return;
    onDone({ ...dish, name: name.trim(), allergens });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', look.tint)}>
              <MaterialSymbol name={look.icon} size="text-lg" />
            </span>
            {isNew ? t('fnb.editor.newDish') : t('fnb.editor.editDishTitle')}
          </DialogTitle>
          <DialogDescription>
            {t(`fnb.meals.${dish.meal}`)} · {dayLabel(dish.day, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            done();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="dish-name">{t('fnb.editor.dishName')}</Label>
            <Input
              id="dish-name"
              autoFocus
              value={name}
              placeholder={t('fnb.editor.dishPlaceholder')}
              aria-invalid={tried && Boolean(issue)}
              aria-describedby={tried && issue ? 'dish-name-error' : undefined}
              className={cn(tried && issue && 'border-error')}
              onChange={(e) => setName(e.target.value)}
            />
            {tried && issue ? (
              <p id="dish-name-error" role="alert" className="text-xs text-error">
                {t(`fnb.editor.issues.${issue}`, { max: DISH_NAME_MAX })}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-on-surface">{t('fnb.editor.containsLabel')}</p>
            <AllergenPicker idPrefix="dish-allergens" value={allergens} counts={counts} onChange={setAllergens} />
            <p className="text-xs text-on-surface-variant">{t('fnb.editor.countsHint')}</p>
          </div>

          {warnings.length ? (
            <div role="note" className="rounded-xl border border-error/30 bg-error/5 p-3 text-sm" data-testid="dish-warning">
              <p className="flex items-center gap-1.5 font-semibold text-error">
                <MaterialSymbol name="warning" size="text-base" />
                {t('fnb.editor.notSafeFor', { count: warnings.length })}
              </p>
              <ul className="mt-1.5 space-y-1">
                {warnings.map((w) => (
                  <li key={w.childId} className={cn('text-xs', severityTone(w.severity) === 'error' ? 'text-error' : 'text-warning')}>
                    <span className="font-semibold">{localName(w.childNameAr, w.childNameEn, isArabic)}</span> ({w.allergens.map((a) => t(`fnb.allergens.${a}`)).join('، ')}
                    {w.severity ? ` · ${t(`fnb.severity.${w.severity}`, { defaultValue: w.severity })}` : ''})
                    {!w.eatsNurseryMeals ? <span className="text-on-surface-variant"> · {t('fnb.ownFood')}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : allergens.length ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <MaterialSymbol name="check_circle" size="text-base" />
              {t('fnb.editor.safeForAll')}
            </p>
          ) : null}

          <DialogFooter className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center">
            {!isNew ? (
              <Button type="button" variant="ghost" className="text-error sm:me-auto" onClick={onDelete}>
                <MaterialSymbol name="delete" size="text-lg" className="me-1" />
                {t('fnb.editor.deleteDish')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('fnb.editor.done')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
