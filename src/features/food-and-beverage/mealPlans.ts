import { MEALS, type Meal } from './menu';

/*
 * Meal plans as plain data and rules: what the nursery offers, each child's current plan, the
 * checks before saving (the database checks the same: save_nursery_meal_plan), and the list's
 * filter and totals.
 */

export type MealPlan = { id: string; nameAr: string; nameEn: string; meals: Meal[]; monthlyPrice: number; active: boolean; children: number };

export type ChildPlan = {
  id: string;
  mealPlanId: string | null;
  nameAr: string;
  nameEn: string;
  meals: Meal[];
  /** Kept as it was when given. */
  monthlyPrice: number;
  /** False: the tuition package includes it. */
  charged: boolean;
  startedOn: string;
};

export type MealPlanChild = {
  childId: string;
  nameAr: string;
  nameEn: string;
  classId: string | null;
  classNameAr: string | null;
  classNameEn: string | null;
  eatsNurseryMeals: boolean;
  /** Has a running tuition plan, so a monthly invoice the meal line can go on. */
  hasTuition: boolean;
  current: ChildPlan | null;
};

export type MealPlanDraft = { nameAr: string; nameEn: string; meals: Meal[]; price: string; active: boolean };
export type MealPlanIssue = 'name_ar_required' | 'name_en_required' | 'name_too_long' | 'meals_required' | 'price_invalid';
export const PLAN_NAME_MAX = 80;
export const PLAN_PRICE_MAX = 100000;

/** Everything wrong with a plan before saving, by field; empty means it can be saved. */
export function mealPlanIssues(draft: MealPlanDraft): Partial<Record<'nameAr' | 'nameEn' | 'meals' | 'price', MealPlanIssue>> {
  const issues: Partial<Record<'nameAr' | 'nameEn' | 'meals' | 'price', MealPlanIssue>> = {};
  if (!draft.nameAr.trim()) issues.nameAr = 'name_ar_required';
  else if (draft.nameAr.trim().length > PLAN_NAME_MAX) issues.nameAr = 'name_too_long';
  if (!draft.nameEn.trim()) issues.nameEn = 'name_en_required';
  else if (draft.nameEn.trim().length > PLAN_NAME_MAX) issues.nameEn = 'name_too_long';
  if (!draft.meals.length) issues.meals = 'meals_required';
  const price = draft.price.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) > PLAN_PRICE_MAX) issues.price = 'price_invalid';
  return issues;
}

/** The meals in the order they are served, each once. */
export const orderedMeals = (meals: readonly string[]): Meal[] => MEALS.filter((m) => meals.includes(m));

export type ChildPlanFilter = 'all' | 'charged' | 'included' | 'none' | 'not_billed';

/** Which children a filter keeps. "not_billed": a charged plan but no monthly invoice to carry it. */
export function childMatches(child: MealPlanChild, filter: ChildPlanFilter): boolean {
  switch (filter) {
    case 'charged':
      return Boolean(child.current?.charged);
    case 'included':
      return Boolean(child.current && !child.current.charged);
    case 'none':
      return !child.current;
    case 'not_billed':
      return isNotBilled(child);
    default:
      return true;
  }
}

/** A plan that should be paid for, on a child with no monthly invoice: nobody would be billed. */
export const isNotBilled = (child: MealPlanChild) => Boolean(child.current?.charged && child.current.monthlyPrice > 0 && !child.hasTuition);

export type MealPlanTotals = { withPlan: number; charged: number; included: number; none: number; monthly: number; notBilled: number };

/** How many children have a plan, are charged or included, and what the plans bring in a month. */
export function mealPlanTotals(children: MealPlanChild[]): MealPlanTotals {
  const charged = children.filter((c) => c.current?.charged);
  return {
    withPlan: children.filter((c) => c.current).length,
    charged: charged.length,
    included: children.filter((c) => c.current && !c.current.charged).length,
    none: children.filter((c) => !c.current).length,
    monthly: Math.round(charged.filter((c) => c.hasTuition).reduce((sum, c) => sum + (c.current?.monthlyPrice ?? 0), 0) * 100) / 100,
    notBilled: children.filter(isNotBilled).length,
  };
}
