import { errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

import { EXTRA_KINDS, HISTORY_KINDS, isStockCategory, sectionOf, type HistoryKind, type ItemDraft, type ItemExtraKind, type KitchenItem, type MovementKind, type StockCategory, type StockMovement, type StockScope } from './kitchen';
import { isFoodAllergen, type FoodAllergen } from './menu';
import { orderedMeals, type ChildPlan, type MealPlan, type MealPlanChild } from './mealPlans';

/*
 * Meal plans and the nursery's stock (the kitchen's and the store's) through their functions
 * (get_meal_plans, set_child_meal_plan, get_stock, get_stock_history, record_kitchen_movement, ...).
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

export type StockPerson = { id: string; nameAr: string; nameEn: string; role: string };
export type StockClass = { id: string; nameAr: string; nameEn: string };
/** This month's figures: deliveries and what came in, went out and was thrown away, at cost; and sales. */
export type StockMonth = { deliveries: number; receivedValue: number; issuedValue: number; usedValue: number; spoiledValue: number; issues: number; salesNet: number };

export type KitchenData = {
  canEdit: boolean;
  canEditKitchen: boolean;
  canEditStore: boolean;
  today: string;
  items: KitchenItem[];
  movements: StockMovement[];
  month: StockMonth;
  /** For those who may change the stock: where an item can be issued. */
  classes: StockClass[];
  staff: StockPerson[];
};

const numOrNull = (v: unknown) => (v == null || v === '' ? null : num(v));
const category = (v: unknown): StockCategory => (isStockCategory(v) ? v : 'other');

export function toStockMonth(row: Json): StockMonth {
  return {
    deliveries: num(row.deliveries),
    receivedValue: num(row.received_value),
    issuedValue: num(row.issued_value),
    usedValue: num(row.used_value),
    spoiledValue: num(row.spoiled_value),
    issues: num(row.issues),
    salesNet: num(row.sales_net),
  };
}

export function toStockMovement(m: Json): StockMovement {
  return {
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
    category: isStockCategory(m.category) ? m.category : null,
    classId: strOrNull(m.class_id),
    classAr: strOrNull(m.class_ar),
    classEn: strOrNull(m.class_en),
    takenByAr: strOrNull(m.taken_by_ar),
    takenByEn: strOrNull(m.taken_by_en),
    supplier: strOrNull(m.supplier),
    unitCost: numOrNull(m.unit_cost),
    value: numOrNull(m.value),
    at: str(m.at),
  };
}

export function toKitchenData(row: Json): KitchenData {
  const canEdit = row.can_edit === true;
  return {
    canEdit,
    canEditKitchen: typeof row.can_edit_kitchen === 'boolean' ? row.can_edit_kitchen : canEdit,
    canEditStore: row.can_edit_store === true,
    today: str(row.today),
    month: toStockMonth((row.month ?? {}) as Json),
    classes: list(row.classes).map((c) => ({ id: str(c.id), nameAr: str(c.name_ar), nameEn: str(c.name_en) })),
    staff: list(row.staff).map((p) => ({ id: str(p.id), nameAr: str(p.name_ar), nameEn: str(p.name_en), role: str(p.role) })),
    items: list(row.items).map((i) => ({
      id: str(i.id),
      name: str(i.name),
      category: category(i.category),
      section: sectionOf(category(i.category)),
      location: strOrNull(i.location),
      canEdit: typeof i.can_edit === 'boolean' ? i.can_edit : canEdit,
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
    movements: list(row.movements).map(toStockMovement),
  };
}

/** A section of the stock (the kitchen's, the store's or both). */
export async function fetchStock(nurseryId: string, scope: StockScope): Promise<KitchenData> {
  const { data, error } = await supabase.rpc('get_stock' as never, { p_nursery_id: nurseryId, p_scope: scope } as never);
  if (error) throw error;
  return toKitchenData(data as Json);
}

export const fetchKitchenStock = (nurseryId: string) => fetchStock(nurseryId, 'kitchen');

export type StockHistory = {
  month: string;
  today: string;
  summary: StockMonth;
  movements: StockMovement[];
  byClass: { classId: string | null; nameAr: string; nameEn: string; issues: number; items: number; value: number }[];
  byCategory: { category: StockCategory; inValue: number; outValue: number; spoiledValue: number; movements: number }[];
};

export function toStockHistory(row: Json): StockHistory {
  return {
    month: str(row.month),
    today: str(row.today),
    summary: toStockMonth((row.summary ?? {}) as Json),
    movements: list(row.movements).map(toStockMovement),
    byClass: list(row.by_class).map((c) => ({
      classId: strOrNull(c.class_id), nameAr: str(c.name_ar), nameEn: str(c.name_en), issues: num(c.issues), items: num(c.items), value: num(c.value),
    })),
    byCategory: list(row.by_category).map((c) => ({
      category: category(c.category), inValue: num(c.in_value), outValue: num(c.out_value), spoiledValue: num(c.spoiled_value), movements: num(c.movements),
    })),
  };
}

/** A month (YYYY-MM) of a section's movements, with what came in and went out by class and category. */
export async function fetchStockHistory(nurseryId: string, month: string, scope: StockScope): Promise<StockHistory> {
  const { data, error } = await supabase.rpc('get_stock_history' as never, { p_nursery_id: nurseryId, p_month: `${month}-01`, p_scope: scope } as never);
  if (error) throw error;
  return toStockHistory(data as Json);
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
    p_extra_kind: sectionOf(d.category) === 'kitchen' ? d.extraKind || null : null,
    p_food_allergens: sectionOf(d.category) === 'kitchen' ? d.foodAllergens : [],
    p_location: d.location.trim() || null,
  } as never);
  if (error) throw error;
  return toKitchenData(data as Json);
}

export async function recordStockMovement(input: {
  itemId: string;
  kind: MovementKind;
  quantity: number;
  expiresOn?: string | null;
  note?: string;
  /** An issue: the class it went to and who took it. */
  classId?: string | null;
  takenBy?: string | null;
  /** A delivery: what a unit cost and who supplied it. */
  unitCost?: number | null;
  supplier?: string | null;
}): Promise<KitchenData> {
  const { data, error } = await supabase.rpc('record_kitchen_movement' as never, {
    p_item_id: input.itemId,
    p_kind: input.kind,
    p_quantity: input.quantity,
    p_expires_on: input.expiresOn || null,
    p_note: input.note?.trim() || null,
    p_class_id: input.kind === 'issued' ? input.classId || null : null,
    p_taken_by: input.kind === 'issued' ? input.takenBy || null : null,
    p_unit_cost: input.kind === 'restocked' ? input.unitCost ?? null : null,
    p_supplier: input.kind === 'restocked' ? input.supplier?.trim() || null : null,
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

const CODES = ['menu_forbidden', 'meal_plan_invalid', 'meal_plan_not_found', 'kitchen_item_invalid', 'kitchen_item_not_found', 'kitchen_invalid_quantity', 'kitchen_not_enough', 'stock_issue_target', 'stock_invalid_cost'] as const;

/** The translation key for an error from these functions (fnb.errors.<code>). */
export const fnbErrorKey = (error: unknown): string => errorTextKey(error, CODES, 'fnb.errors');

/** The same for the stock's screens: "menu_forbidden" there means this part of the stock. */
export function stockErrorKey(error: unknown): string {
  const key = fnbErrorKey(error);
  return key === 'fnb.errors.menu_forbidden' ? 'stock.errors.forbidden' : key;
}
