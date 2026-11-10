/*
 * Editing a menu: the dishes as drafts, what stops one from being saved, the payload save_menu_period
 * takes, and the children a dish would not be safe for while it is being tagged. The database checks
 * the same rules; these give the editor the same answers first.
 */
import type { ExtractedDish } from '../../../supabase/functions/_shared/menuExtraction.ts';
import { DISH_NAME_MAX } from '../../../supabase/functions/_shared/menuRules.ts';

import { isFoodAllergen, MEALS, severityRank, type FoodAllergen, type Meal, type MenuDish } from './menu';

export { DISH_NAME_MAX };

export type DraftDish = { key: string; day: string; meal: Meal; name: string; allergens: FoodAllergen[] };
export type DishIssue = 'name_required' | 'name_too_long';

export function dishIssue(dish: Pick<DraftDish, 'name'>): DishIssue | null {
  const name = dish.name.trim();
  if (!name) return 'name_required';
  if (name.length > DISH_NAME_MAX) return 'name_too_long';
  return null;
}

/** Every dish with a problem, by key; empty means the menu can be saved. */
export function draftIssues(dishes: DraftDish[]): Record<string, DishIssue> {
  return Object.fromEntries(dishes.flatMap((d) => {
    const issue = dishIssue(d);
    return issue ? [[d.key, issue]] : [];
  }));
}

/** The dishes as save_menu_period takes them, in the order shown (day, then meal). */
export function toSavePayload(dishes: DraftDish[]) {
  return [...dishes]
    .sort((a, b) => a.day.localeCompare(b.day) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal))
    .map((d) => ({ day: d.day, meal: d.meal, name: d.name.trim(), allergens: [...new Set(d.allergens)] }));
}

/** Saved dishes as editable drafts. */
export const toDrafts = (dishes: MenuDish[]): DraftDish[] =>
  dishes.map((d) => ({ key: d.id, day: d.day, meal: d.meal, name: d.name, allergens: [...d.allergens] }));

/** Dishes read from the menu file as drafts to check (each with its own key). */
export const toImportedDrafts = (dishes: ExtractedDish[], keyPrefix = `file-${Date.now()}`): DraftDish[] =>
  dishes.map((d, i) => ({ key: `${keyPrefix}-${i}`, day: d.day, meal: d.meal, name: d.name, allergens: d.allergens.filter(isFoodAllergen) }));

export type AllergicChild = { childId: string; childNameAr: string; childNameEn: string; severity: string | null; eatsNurseryMeals: boolean };

/**
 * The children a dish would not be safe for, from its tags and the nursery's allergies (the same
 * rule as the database: a tag meets a child's food allergy). Each child once, with what they react
 * to, worst first; children who bring their own food last.
 */
export function dishWarnings(
  allergens: FoodAllergen[],
  index: Partial<Record<FoodAllergen, AllergicChild[]>>,
): Array<AllergicChild & { allergens: FoodAllergen[] }> {
  const byChild = new Map<string, AllergicChild & { allergens: FoodAllergen[] }>();
  for (const allergen of allergens) {
    for (const child of index[allergen] ?? []) {
      const entry = byChild.get(child.childId) ?? { ...child, allergens: [] };
      entry.allergens.push(allergen);
      if (severityRank(child.severity) < severityRank(entry.severity)) entry.severity = child.severity;
      byChild.set(child.childId, entry);
    }
  }
  return [...byChild.values()].sort(
    (a, b) => Number(b.eatsNurseryMeals) - Number(a.eatsNurseryMeals) || severityRank(a.severity) - severityRank(b.severity) || a.childNameEn.localeCompare(b.childNameEn),
  );
}
