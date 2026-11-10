/*
 * The menu's rules that the app, the menu-extract edge function and the database share: the meals,
 * the food allergens a dish is tagged with, the limits save_menu_period checks, the files a menu may
 * have, and which days the nursery is open. Plain TypeScript with no imports, so Deno and the app
 * (Vite, Vitest) read the same single copy.
 */

export const MEALS = ['breakfast', 'lunch', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

/** The food allergens a dish can be tagged with (public.food_allergens). */
export const FOOD_ALLERGENS = ['milk', 'eggs', 'peanuts', 'tree_nuts', 'gluten', 'soy', 'fish', 'shellfish', 'sesame', 'strawberry', 'citrus'] as const;
export type FoodAllergen = (typeof FOOD_ALLERGENS)[number];

export const isMeal = (value: unknown): value is Meal => typeof value === 'string' && (MEALS as readonly string[]).includes(value);
export const isFoodAllergen = (value: unknown): value is FoodAllergen => typeof value === 'string' && (FOOD_ALLERGENS as readonly string[]).includes(value);

/** A menu covers a week (Saturday to Friday) or a calendar month, as the nursery chooses. */
export const MENU_PERIODS = ['week', 'month'] as const;
export type MenuPeriod = (typeof MENU_PERIODS)[number];

export const DISH_NAME_MAX = 120;

/** How many dishes a period's menu may hold (save_menu_period checks the same). */
export const maxDishes = (period: MenuPeriod) => (period === 'month' ? 500 : 100);

/** The files a menu may have (set_menu_period_file checks the same). */
export const MENU_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type MenuFileType = (typeof MENU_FILE_TYPES)[number];

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** When the nursery has not said which days it works. */
const DEFAULT_WORKING_DAYS: readonly string[] = ['sun', 'mon', 'tue', 'wed', 'thu'];

/** A YYYY-MM-DD day at midnight UTC, so no time zone shifts it. */
export const toUtcDate = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);

/** The days the nursery is open from `from` to `to`, both included. */
export function openDaysBetween(from: string, to: string, workingDays: readonly string[]): string[] {
  const open = workingDays.length ? workingDays : DEFAULT_WORKING_DAYS;
  const days: string[] = [];
  for (let date = toUtcDate(from); date <= toUtcDate(to); date.setUTCDate(date.getUTCDate() + 1)) {
    if (open.includes(WEEKDAYS[date.getUTCDay()])) days.push(date.toISOString().slice(0, 10));
  }
  return days;
}
