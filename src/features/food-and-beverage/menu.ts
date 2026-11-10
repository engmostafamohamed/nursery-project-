/*
 * F&B basics as plain data (no React, no network): the meals, the food allergens dishes are tagged
 * with (one copy, shared with the menu-extract edge function), how serious a reaction is, and the
 * shape of a dish and of a dish that meets a child's allergy. Each job built on them has its own
 * file: menuPeriod (weeks and months), menuDrafts (editing), foodAlerts, menuFile.
 */
import type { FoodAllergen, Meal } from '../../../supabase/functions/_shared/menuRules.ts';

export { FOOD_ALLERGENS, isFoodAllergen, isMeal, MEALS, type FoodAllergen, type Meal } from '../../../supabase/functions/_shared/menuRules.ts';

export type Severity = 'life_threatening' | 'severe' | 'moderate' | 'mild';
const SEVERITY_ORDER: Severity[] = ['life_threatening', 'severe', 'moderate', 'mild'];

/** Worst first; an unknown severity sorts last. */
export const severityRank = (severity: string | null) => {
  const index = SEVERITY_ORDER.indexOf(severity as Severity);
  return index < 0 ? SEVERITY_ORDER.length : index;
};

/** The worse the reaction, the stronger the colour; an unknown one is treated with care. */
export const severityTone = (severity: string | null): 'error' | 'warning' =>
  severity === 'mild' || severity === 'moderate' ? 'warning' : 'error';

export type FoodConflict = {
  dishId: string;
  day: string;
  meal: Meal;
  dishName: string;
  weekStatus: 'draft' | 'published';
  childId: string;
  childNameAr: string;
  childNameEn: string;
  classNameAr: string | null;
  classNameEn: string | null;
  allergen: FoodAllergen;
  allergyName: string;
  severity: string | null;
  reaction: string | null;
  treatment: string | null;
  /** False when the family sends the child's food: listed, but less urgent. */
  eatsNurseryMeals: boolean;
};

export type MenuDish = {
  id: string;
  day: string;
  meal: Meal;
  name: string;
  allergens: FoodAllergen[];
  conflicts: FoodConflict[];
};

/** The dishes of one day and meal, in their order. */
export const dishesOf = <T extends Pick<MenuDish, 'day' | 'meal'>>(dishes: T[], day: string, meal: Meal) =>
  dishes.filter((d) => d.day === day && d.meal === meal);
