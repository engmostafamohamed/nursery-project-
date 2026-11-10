import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { DishDialog } from './DishDialog';
import { DishTile, DishWarning } from './DishTile';
import { MenuBoard } from './MenuBoard';
import { MenuFileImport } from './MenuFileImport';
import { dishesOf, severityTone, type Meal } from './menu';
import { dishWarnings, toDrafts, toSavePayload, type DraftDish } from './menuDrafts';
import { localName } from '@/lib/bilingualName';
import { maxDishes, openDaysBetween } from './menuPeriod';
import { menuErrorKey } from './menuErrors';
import { saveMenu, type Menu } from './menuApi';
import { useMenuChange } from './useMenu';

let draftCounter = 0;
const newKey = () => `new-${Date.now()}-${(draftCounter += 1)}`;

type Editing = { dish: DraftDish; isNew: boolean } | null;

/**
 * Writing a week's or a month's menu on the menu board: each dish is a card (tap to edit), each
 * cell has its own "add", and the card turns red when a child here must not eat it. The dishes can
 * also be filled from the menu file by the app's AI. Changes stay on the page until "Save menu",
 * which stores the period in one go. Mount it with a key per saved version.
 */
export function MenuEditor({ nurseryId, menu, today, onDirtyChange }: { nurseryId: string; menu: Menu; today: string; onDirtyChange: (dirty: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const [drafts, setDrafts] = useState<DraftDish[]>(() => toDrafts(menu.dishes));
  const [notes, setNotes] = useState(menu.info?.notes ?? '');
  const [editing, setEditing] = useState<Editing>(null);
  const save = useMenuChange(nurseryId, () => saveMenu({ nurseryId, day: menu.startsOn, notes, dishes: toSavePayload(drafts) }));
  const limit = maxDishes(menu.period);

  const saved = useMemo(() => JSON.stringify([toSavePayload(toDrafts(menu.dishes)), menu.info?.notes ?? '']), [menu]);
  const dirty = JSON.stringify([toSavePayload(drafts), notes.trim()]) !== saved;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const keep = (dish: DraftDish) => {
    setDrafts((list) => (list.some((d) => d.key === dish.key) ? list.map((d) => (d.key === dish.key ? dish : d)) : [...list, dish]));
    setEditing(null);
  };
  const drop = (key: string) => {
    setDrafts((list) => list.filter((d) => d.key !== key));
    setEditing(null);
  };
  const add = (day: string, meal: Meal) => setEditing({ dish: { key: newKey(), day, meal, name: '', allergens: [] }, isNew: true });

  const submit = async () => {
    try {
      await save.mutateAsync(undefined);
      toast.success(t('fnb.editor.saved'));
    } catch (error) {
      toast.error(t(menuErrorKey(error)));
    }
  };

  const warningLines = (dish: DraftDish) =>
    dishWarnings(dish.allergens, menu.allergyIndex).map((w) => ({
      key: w.childId,
      text: `${localName(w.childNameAr, w.childNameEn, isArabic)} · ${w.allergens.map((a) => t(`fnb.allergens.${a}`)).join('، ')}`,
      strong: severityTone(w.severity) === 'error',
      ownFood: !w.eatsNurseryMeals,
    }));

  return (
    <div className="space-y-4">
      <MenuFileImport nurseryId={nurseryId} menu={menu} hasDishes={drafts.length > 0} onImport={setDrafts} />
      <MenuBoard
        days={openDaysBetween(menu.startsOn, menu.endsOn, menu.workingDays)}
        today={today}
        renderCell={(day, meal) => (
          <>
            {dishesOf(drafts, day, meal).map((dish) => {
              const lines = warningLines(dish);
              return (
                <DishTile
                  key={dish.key}
                  name={dish.name}
                  allergens={dish.allergens}
                  danger={dishWarnings(dish.allergens, menu.allergyIndex).flatMap((w) => w.allergens)}
                  warning={<DishWarning lines={lines} />}
                  onEdit={() => setEditing({ dish, isNew: false })}
                />
              );
            })}
            <button
              type="button"
              aria-label={t('fnb.editor.addDish', { meal: t(`fnb.meals.${meal}`) })}
              disabled={drafts.length >= limit}
              onClick={() => add(day, meal)}
              className={cn(
                'flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-outline-variant py-2 text-xs font-medium text-on-surface-variant outline-none transition-colors',
                'hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
              )}
            >
              <MaterialSymbol name="add" size="text-base" />
              {t('fnb.editor.add')}
            </button>
          </>
        )}
      />

      <div className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
        <Label htmlFor="menu-notes" className="flex items-center gap-1.5">
          <MaterialSymbol name="sticky_note_2" size="text-base" className="text-primary" />
          {t('fnb.editor.notes')}
        </Label>
        <Textarea
          id="menu-notes"
          rows={2}
          maxLength={1000}
          className="mt-2"
          value={notes}
          placeholder={t('fnb.editor.notesPlaceholder')}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-outline-variant bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className={cn('me-auto flex items-center gap-1.5 text-sm', dirty ? 'text-warning' : 'text-success')} aria-live="polite">
          <MaterialSymbol name={dirty ? 'edit_note' : 'cloud_done'} size="text-lg" />
          {dirty ? t('fnb.editor.unsaved') : t('fnb.editor.allSaved')}
        </p>
        <Button type="button" onClick={() => void submit()} disabled={!dirty || save.isPending} aria-busy={save.isPending}>
          <MaterialSymbol name={save.isPending ? 'progress_activity' : 'save'} size="text-lg" className={save.isPending ? 'me-1 animate-spin' : 'me-1'} />
          {save.isPending ? t('fnb.editor.saving') : t('fnb.editor.save')}
        </Button>
      </div>

      {editing ? (
        <DishDialog
          key={editing.dish.key}
          dish={editing.dish}
          isNew={editing.isNew}
          allergyIndex={menu.allergyIndex}
          onDone={keep}
          onDelete={() => drop(editing.dish.key)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
