/*
 * F&B as plain data and rules (no React, no network): the weekly menu's days and meals, the food
 * allergens dishes are tagged with, the alerts they raise, and the menu file. The database checks
 * the same rules (save_menu_week, set_menu_week_file); these give the screens the same answers first.
 */

export const MEALS = ['breakfast', 'lunch', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

/** The food allergens a dish can be tagged with (public.food_allergens). */
export const FOOD_ALLERGENS = ['milk', 'eggs', 'peanuts', 'tree_nuts', 'gluten', 'soy', 'fish', 'shellfish', 'sesame', 'strawberry', 'citrus'] as const;
export type FoodAllergen = (typeof FOOD_ALLERGENS)[number];
export const isFoodAllergen = (value: string): value is FoodAllergen => (FOOD_ALLERGENS as readonly string[]).includes(value);

export type Severity = 'life_threatening' | 'severe' | 'moderate' | 'mild';
const SEVERITY_ORDER: Severity[] = ['life_threatening', 'severe', 'moderate', 'mild'];
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

// -------------------------------------------------------------------------------------------------
// Days. Dates are YYYY-MM-DD strings, worked out in UTC so no time zone shifts them.

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
/** When the nursery has not said which days it works. */
export const DEFAULT_WORKING_DAYS: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu'];

const toUtc = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
const toYmd = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(ymd: string, days: number): string {
  const date = toUtc(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

export const weekdayKey = (ymd: string): WeekdayKey => WEEKDAY_KEYS[toUtc(ymd).getUTCDay()];

/** The Saturday the day's week starts on (weeks run Saturday to Friday, as in the database). */
export function weekStartOf(ymd: string): string {
  return addDays(ymd, -((toUtc(ymd).getUTCDay() + 1) % 7));
}

/** The days of the week the nursery is open, in order. */
export function openDays(weekStart: string, workingDays: readonly string[]): string[] {
  const open = workingDays.length ? workingDays : DEFAULT_WORKING_DAYS;
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((day) => open.includes(weekdayKey(day)));
}

/** The dishes of one day and meal, in their order. */
export const dishesOf = <T extends Pick<MenuDish, 'day' | 'meal'>>(dishes: T[], day: string, meal: Meal) =>
  dishes.filter((d) => d.day === day && d.meal === meal);

// -------------------------------------------------------------------------------------------------
// Editing a week

export type DraftDish = { key: string; day: string; meal: Meal; name: string; allergens: FoodAllergen[] };
export type DishIssue = 'name_required' | 'name_too_long';
export const DISH_NAME_MAX = 120;
export const MAX_DISHES = 100;

export function dishIssue(dish: Pick<DraftDish, 'name'>): DishIssue | null {
  const name = dish.name.trim();
  if (!name) return 'name_required';
  if (name.length > DISH_NAME_MAX) return 'name_too_long';
  return null;
}

/** Every dish with a problem, by key; empty means the week can be saved. */
export function draftIssues(dishes: DraftDish[]): Record<string, DishIssue> {
  return Object.fromEntries(dishes.flatMap((d) => {
    const issue = dishIssue(d);
    return issue ? [[d.key, issue]] : [];
  }));
}

/** The dishes as save_menu_week takes them, in the order shown (day, then meal). */
export function toSavePayload(dishes: DraftDish[]) {
  return [...dishes]
    .sort((a, b) => a.day.localeCompare(b.day) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal))
    .map((d) => ({ day: d.day, meal: d.meal, name: d.name.trim(), allergens: [...new Set(d.allergens)] }));
}

/** Saved dishes as editable drafts. */
export const toDrafts = (dishes: MenuDish[]): DraftDish[] =>
  dishes.map((d) => ({ key: d.id, day: d.day, meal: d.meal, name: d.name, allergens: [...d.allergens] }));

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

// -------------------------------------------------------------------------------------------------
// Alerts

/** One child's alerts of a day, worst first, so the person serving sees each child once. */
export type ChildAlert = {
  childId: string;
  childNameAr: string;
  childNameEn: string;
  classNameAr: string | null;
  classNameEn: string | null;
  eatsNurseryMeals: boolean;
  worstSeverity: string | null;
  items: FoodConflict[];
};

export function alertsByDayAndChild(conflicts: FoodConflict[]): Array<{ day: string; children: ChildAlert[] }> {
  const days = [...new Set(conflicts.map((c) => c.day))].sort();
  return days.map((day) => {
    const byChild = new Map<string, ChildAlert>();
    for (const c of conflicts.filter((x) => x.day === day)) {
      const entry = byChild.get(c.childId) ?? {
        childId: c.childId,
        childNameAr: c.childNameAr,
        childNameEn: c.childNameEn,
        classNameAr: c.classNameAr,
        classNameEn: c.classNameEn,
        eatsNurseryMeals: c.eatsNurseryMeals,
        worstSeverity: c.severity,
        items: [],
      };
      entry.items.push(c);
      if (severityRank(c.severity) < severityRank(entry.worstSeverity)) entry.worstSeverity = c.severity;
      byChild.set(c.childId, entry);
    }
    const children = [...byChild.values()]
      .map((child) => ({ ...child, items: [...child.items].sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal)) }))
      .sort((a, b) => Number(b.eatsNurseryMeals) - Number(a.eatsNurseryMeals) || severityRank(a.worstSeverity) - severityRank(b.worstSeverity) || a.childNameEn.localeCompare(b.childNameEn));
    return { day, children };
  });
}

// -------------------------------------------------------------------------------------------------
// The menu file

export const MENU_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MENU_FILE_MAX_BYTES = 5 * 1024 * 1024;
/** Photos are made smaller before upload, so a large phone photo still fits. */
export const MENU_IMAGE_TARGET_MB = 1.5;
export const MENU_SOURCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export type MenuFileProblem = 'invalid_type' | 'too_large';

/** What is wrong with a file before it is prepared (a photo is compressed after this check). */
export function menuFileProblem(file: Pick<File, 'type' | 'size'>): MenuFileProblem | null {
  if (!(MENU_FILE_TYPES as readonly string[]).includes(file.type)) return 'invalid_type';
  const limit = file.type === 'application/pdf' ? MENU_FILE_MAX_BYTES : MENU_SOURCE_IMAGE_MAX_BYTES;
  return file.size > limit ? 'too_large' : null;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Where a week's file is stored: menu-files/<nursery>/<week start>/<time>.<ext>. */
export function menuFilePath(nurseryId: string, weekStart: string, type: string, now = Date.now()): string {
  return `${nurseryId}/${weekStart}/${now}.${EXTENSIONS[type] ?? 'bin'}`;
}

/** A child's or class's name in the reader's language, falling back to the other. */
export function localName(ar: string | null | undefined, en: string | null | undefined, isArabic: boolean): string {
  const a = ar?.trim() ?? '';
  const e = en?.trim() ?? '';
  return (isArabic ? a || e : e || a) || '';
}

export type UnmatchedAllergy = { childId: string; childNameAr: string; childNameEn: string; allergyName: string; severity: string | null };

/**
 * Allergies the menu is not checked against, grouped by the allergy as typed (case and spaces
 * ignored), the largest group first; each child once per group, worst reaction first.
 */
export function groupUnmatched(items: UnmatchedAllergy[]): Array<{ key: string; name: string; children: UnmatchedAllergy[] }> {
  const groups = new Map<string, { key: string; name: string; children: UnmatchedAllergy[] }>();
  for (const item of items) {
    const key = item.allergyName.trim().toLowerCase().replace(/\s+/g, ' ');
    const group = groups.get(key) ?? { key, name: item.allergyName.trim(), children: [] };
    if (!group.children.some((c) => c.childId === item.childId)) group.children.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, children: [...g.children].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.childNameEn.localeCompare(b.childNameEn)) }))
    .sort((a, b) => b.children.length - a.children.length || a.name.localeCompare(b.name));
}
