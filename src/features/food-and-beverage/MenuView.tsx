import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { DishTile, DishWarning } from './DishTile';
import { MenuBoard } from './MenuBoard';
import { dishesOf, severityTone, type MenuDish } from './menu';
import { localName } from '@/lib/bilingualName';
import { menuOpenDays } from './menuPeriod';
import type { Menu } from './menuApi';

/**
 * A week's or a month's menu to read, on the menu board. A dish a child here must not eat is red and names the
 * child and why (a parent sees only their own children). Today is marked.
 */
export function MenuView({ menu, today, audience }: { menu: Menu; today: string; audience: 'parent' | 'staff' }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');

  if (!menu.info || (!menu.dishes.length && !menu.info.file)) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-outline-variant bg-surface p-10 text-center" data-testid="menu-empty">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MaterialSymbol name="restaurant_menu" size="text-2xl" />
        </span>
        <p className="text-sm text-on-surface-variant">{audience === 'parent' ? t('fnb.view.emptyParent') : t('fnb.view.emptyStaff')}</p>
      </div>
    );
  }

  const lines = (dish: MenuDish) =>
    [...new Map(dish.conflicts.map((c) => [c.childId, c])).values()].map((c) => {
      const allergens = [...new Set(dish.conflicts.filter((x) => x.childId === c.childId).map((x) => t(`fnb.allergens.${x.allergen}`)))].join('، ');
      return {
        key: c.childId,
        text: t('fnb.view.allergicLine', { name: localName(c.childNameAr, c.childNameEn, isArabic), allergens }),
        strong: severityTone(c.severity) === 'error',
        ownFood: !c.eatsNurseryMeals,
      };
    });

  return (
    <div className="space-y-3">
      {menu.info.notes ? (
        <p className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-sm text-on-surface">
          <MaterialSymbol name="sticky_note_2" size="text-base" className="mt-0.5 text-primary" />
          {menu.info.notes}
        </p>
      ) : null}
      <MenuBoard
        days={menuOpenDays(menu)}
        today={today}
        renderCell={(day, meal) => {
          const dishes = dishesOf(menu.dishes, day, meal);
          if (!dishes.length) return <p className="px-1 py-2 text-xs text-on-surface-variant">—</p>;
          return dishes.map((dish) => (
            <DishTile
              key={dish.id}
              name={dish.name}
              allergens={dish.allergens}
              danger={dish.conflicts.map((c) => c.allergen)}
              warning={<DishWarning lines={lines(dish)} />}
            />
          ));
        }}
      />
    </div>
  );
}
