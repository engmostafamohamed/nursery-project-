import { supabase } from '@/lib/supabase';

import { EXTRA_KINDS, HISTORY_KINDS, KITCHEN_CATEGORIES, type HistoryKind, type ItemDraft, type ItemExtraKind, type KitchenCategory, type KitchenItem, type MovementKind, type StockMovement } from './kitchen';
import { isFoodAllergen, type FoodAllergen } from './menu';
import { orderedMeals, type ChildPlan, type MealPlan, type MealPlanChild } from './mealPlans';

/*
 * Meal plans and kitchen stock through their F&B functions (get_meal_plans, set_child_meal_plan,
 * get_kitchen_stock, record_kitchen_movement, ...). Each change returns the page's data as it now
 * is, so the screen shows it at once.
 */

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const meals = (v: unknown) => orderedMeals(Array.isArray(v) ? (v as unknown[]).filter((m): m is string => typeof m === 'string') : []);

export type MealPlansData = { canEdit: boolean; plans: MealPlan[]; children: MealPlanChild[] };

export function toMealPlansData(row: Json): MealPlansData {
  return {
    canEdit: row.can_edit === true,
    plans: list(row.plans).map((p) => ({
      id: str(p.id),
      nameAr: str(p.name_ar),
      nameEn: str(p.name_en),
      meals: meals(p.meals),
      monthlyPrice: num(p.monthly_price),
      active: p.active !== false,
      children: num(p.children),
    })),
    children: list(row.children).map((c) => {
      const current = c.current && typeof c.current === 'object' ? (c.current as Json) : null;
      const plan: ChildPlan | null = current
        ? {
            id: str(current.id),
            mealPlanId: strOrNull(current.meal_plan_id),
            nameAr: str(current.name_ar),
            nameEn: str(current.name_en),
            meals: meals(current.meals),
            monthlyPrice: num(current.monthly_price),
            charged: current.charged !== false,
            startedOn: str(current.started_on),
          }
        : null;
      return {
        childId: str(c.child_id),
        nameAr: str(c.name_ar),
        nameEn: str(c.name_en),
        classId: strOrNull(c.class_id),
        classNameAr: strOrNull(c.class_name_ar),
        classNameEn: strOrNull(c.class_name_en),
        eatsNurseryMeals: c.eats_nursery_meals !== false,
        hasTuition: c.has_tuition === true,
        current: plan,
      };
    }),
  };
}

export async function fetchMealPlans(nurseryId: string): Promise<MealPlansData> {
  const { data, error } = await supabase.rpc('get_meal_plans' as never, { p_nursery_id: nurseryId } as never);
  if (error) throw error;
  return toMealPlansData(data as Json);
}

export async function saveMealPlan(input: {
  nurseryId: string;
  id: string | null;
  nameAr: string;
  nameEn: string;
  meals: string[];
  monthlyPrice: number;
  active: boolean;
}): Promise<MealPlansData> {
  const { data, error } = await supabase.rpc('save_nursery_meal_plan' as never, {
    p_nursery_id: input.nurseryId,
    p_id: input.id,
    p_name_ar: input.nameAr.trim(),
    p_name_en: input.nameEn.trim(),
    p_meals: input.meals,
    p_monthly_price: input.monthlyPrice,
    p_active: input.active,
  } as never);
  if (error) throw error;
  return toMealPlansData(data as Json);
}

/** A null plan stops the child's plan. */
export async function setChildMealPlan(childId: string, mealPlanId: string | null, charged: boolean): Promise<MealPlansData> {
  const { data, error } = await supabase.rpc('set_child_meal_plan' as never, { p_child_id: childId, p_meal_plan_id: mealPlanId, p_charged: charged } as never);
  if (error) throw error;
  return toMealPlansData(data as Json);
}

export type KitchenData = { canEdit: boolean; today: string; items: KitchenItem[]; movements: StockMovement[] };

export function toKitchenData(row: Json): KitchenData {
  return {
    canEdit: row.can_edit === true,
    today: str(row.today),
    items: list(row.items).map((i) => ({
      id: str(i.id),
      name: str(i.name),
      category: (KITCHEN_CATEGORIES as readonly string[]).includes(str(i.category)) ? (str(i.category) as KitchenCategory) : 'food',
      quantity: num(i.quantity),
      unit: str(i.unit),
      lowStockLevel: num(i.low_stock_level),
      expiresOn: strOrNull(i.expires_on),
      lastRestocked: strOrNull(i.last_restocked),
      unitCost: i.unit_cost == null ? null : num(i.unit_cost),
      childPrice: i.child_price == null ? null : num(i.child_price),
      staffPrice: i.staff_price == null ? null : num(i.staff_price),
      packSize: i.pack_size == null ? null : num(i.pack_size),
      packUnit: strOrNull(i.pack_unit),
      extraKind: (EXTRA_KINDS as readonly string[]).includes(str(i.extra_kind)) ? (str(i.extra_kind) as ItemExtraKind) : null,
      foodAllergens: (Array.isArray(i.food_allergens) ? i.food_allergens : []).filter((a): a is FoodAllergen => typeof a === 'string' && isFoodAllergen(a)),
    })),
    movements: list(row.movements).map((m) => ({
      id: str(m.id),
      itemId: str(m.item_id),
      itemName: str(m.item_name),
      unit: str(m.unit),
      kind: (HISTORY_KINDS as readonly string[]).includes(str(m.kind)) ? (str(m.kind) as HistoryKind) : 'counted',
      change: num(m.change),
      quantityAfter: num(m.quantity_after),
      note: strOrNull(m.note),
      byAr: strOrNull(m.by_ar),
      byEn: strOrNull(m.by_en),
      forAr: strOrNull(m.for_ar),
      forEn: strOrNull(m.for_en),
      at: str(m.at),
    })),
  };
}

export async function fetchKitchenStock(nurseryId: string): Promise<KitchenData> {
  const { data, error } = await supabase.rpc('get_kitchen_stock' as never, { p_nursery_id: nurseryId } as never);
  if (error) throw error;
  return toKitchenData(data as Json);
}

/** Adds an item or changes it, with its prices, pack and extra kind (blank prices: not sold). */
export async function saveKitchenItem(input: { nurseryId: string; id: string | null; draft: ItemDraft }): Promise<KitchenData> {
  const d = input.draft;
  const amount = (v: string) => (v.trim() ? Number(v) : null);
  const { data, error } = await supabase.rpc('save_kitchen_item' as never, {
    p_nursery_id: input.nurseryId,
    p_id: input.id,
    p_name: d.name.trim(),
    p_category: d.category,
    p_unit: d.unit.trim(),
    p_low_stock_level: Number(d.lowStockLevel),
    p_expires_on: d.expiresOn || null,
    p_unit_cost: amount(d.unitCost),
    p_child_price: amount(d.childPrice),
    p_staff_price: amount(d.staffPrice),
    p_pack_size: amount(d.packSize),
    p_pack_unit: d.packSize.trim() ? d.packUnit.trim() : null,
    p_extra_kind: d.extraKind || null,
    p_food_allergens: d.foodAllergens,
  } as never);
  if (error) throw error;
  return toKitchenData(data as Json);
}

export async function recordStockMovement(input: { itemId: string; kind: MovementKind; quantity: number; expiresOn?: string | null; note?: string }): Promise<KitchenData> {
  const { data, error } = await supabase.rpc('record_kitchen_movement' as never, {
    p_item_id: input.itemId,
    p_kind: input.kind,
    p_quantity: input.quantity,
    p_expires_on: input.expiresOn || null,
    p_note: input.note?.trim() || null,
  } as never);
  if (error) throw error;
  return toKitchenData(data as Json);
}

export async function deleteKitchenItem(itemId: string): Promise<KitchenData> {
  const { data, error } = await supabase.rpc('delete_kitchen_item' as never, { p_item_id: itemId } as never);
  if (error) throw error;
  return toKitchenData(data as Json);
}

export type FamilyChildPlan = { childId: string; childNameAr: string; childNameEn: string; plan: ChildPlan };

/** A parent's children's current meal plans (the table lets a parent read only their own children's). */
export async function fetchFamilyMealPlans(): Promise<FamilyChildPlan[]> {
  const { data, error } = await supabase
    .from('child_meal_plans')
    .select('id, child_id, meal_plan_id, plan_name_ar, plan_name_en, meals, monthly_price, charged, started_on, children ( full_name_ar, full_name_en )')
    .is('ended_on', null);
  if (error) throw error;
  return ((data ?? []) as Json[]).map((row) => {
    const child = (row.children ?? {}) as Json;
    return {
      childId: str(row.child_id),
      childNameAr: str(child.full_name_ar),
      childNameEn: str(child.full_name_en),
      plan: {
        id: str(row.id),
        mealPlanId: strOrNull(row.meal_plan_id),
        nameAr: str(row.plan_name_ar),
        nameEn: str(row.plan_name_en),
        meals: meals(row.meals),
        monthlyPrice: num(row.monthly_price),
        charged: row.charged !== false,
        startedOn: str(row.started_on),
      },
    };
  });
}

const CODES = ['menu_forbidden', 'meal_plan_invalid', 'meal_plan_not_found', 'kitchen_item_invalid', 'kitchen_item_not_found', 'kitchen_invalid_quantity', 'kitchen_not_enough'] as const;

/** The translation key for an error from these functions (fnb.errors.<code>). */
export function fnbErrorKey(error: unknown): string {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : String(error ?? '');
  const code = CODES.find((c) => message.includes(c));
  return code ? `fnb.errors.${code}` : 'fnb.errors.failed';
}
