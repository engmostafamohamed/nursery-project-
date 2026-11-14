/*
 * The menu's rules that the app, the menu-extract edge function and the database share: the meals,
 * the food allergens a dish is tagged with, the limits save_menu_period checks, the files a menu may
 * have, and which days the nursery is open. Plain TypeScript (its only import is the shared weekdays
 * file next to it), so Deno and the app (Vite, Vitest) read the same single copy.
 */

import { openWeekdays, WEEKDAY_KEYS } from './weekdays.ts';

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

export const WEEKDAYS = WEEKDAY_KEYS;

/** A YYYY-MM-DD day at midnight UTC, so no time zone shifts it. */
export const toUtcDate = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);

/**
 * The days the nursery works from `from` to `to`, both included, by its weekdays alone (however
 * they are stored; Sunday to Thursday when none are). Holidays are not known here: menuDays uses
 * the server's open days when it sent them.
 */
export function openDaysBetween(from: string, to: string, workingDays: readonly unknown[]): string[] {
  const open = openWeekdays(workingDays);
  const days: string[] = [];
  for (let date = toUtcDate(from); date <= toUtcDate(to); date.setUTCDate(date.getUTCDate() + 1)) {
    if (open.includes(date.getUTCDay())) days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * The days a menu period covers: the server's open days (its weekdays less its holidays, the same
 * rule as attendance) when it sent them, else the weekdays alone.
 */
export function menuDays(period: { starts_on: string; ends_on: string; working_days?: readonly unknown[] | null; open_days?: readonly string[] | null }): string[] {
  if (Array.isArray(period.open_days)) return period.open_days.map((d) => String(d).slice(0, 10));
  return openDaysBetween(period.starts_on, period.ends_on, period.working_days ?? []);
}
