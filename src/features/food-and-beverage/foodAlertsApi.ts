import { list, oneOf, text, textOrNull, type JsonRecord } from '@/lib/jsonRead';
import { supabase } from '@/lib/supabase';

import type { UnmatchedAllergy } from './foodAlerts';
import { FOOD_ALLERGENS, MEALS, type FoodConflict } from './menu';

/** A dish that meets a child's food allergy, as get_food_allergy_alerts and get_menu_period send it. */
export function toConflict(row: JsonRecord): FoodConflict {
  return {
    dishId: text(row.dish_id),
    day: text(row.day),
    meal: oneOf(row.meal, MEALS, 'lunch'),
    dishName: text(row.dish_name),
    weekStatus: oneOf(row.week_status, ['draft', 'published'] as const, 'draft'),
    childId: text(row.child_id),
    childNameAr: text(row.child_name_ar),
    childNameEn: text(row.child_name_en),
    classNameAr: textOrNull(row.class_name_ar),
    classNameEn: textOrNull(row.class_name_en),
    allergen: oneOf(row.allergen, FOOD_ALLERGENS, 'milk'),
    allergyName: text(row.allergy_name),
    severity: textOrNull(row.severity),
    reaction: textOrNull(row.reaction),
    treatment: textOrNull(row.treatment),
    eatsNurseryMeals: row.eats_nursery_meals !== false,
  };
}

export type FoodAlerts = {
  conflicts: FoodConflict[];
  /** Children's allergies that name no food allergen: the menu is not checked against them. */
  unmatched: UnmatchedAllergy[];
};

/** The dishes from `from` to `to` that some child must not eat (one child, or the whole nursery). */
export async function fetchFoodAlerts(input: { nurseryId: string; from: string; to: string; childId?: string }): Promise<FoodAlerts> {
  const { data, error } = await supabase.rpc('get_food_allergy_alerts' as never, {
    p_nursery_id: input.nurseryId,
    p_from: input.from,
    p_to: input.to,
    p_child_id: input.childId ?? null,
  } as never);
  if (error) throw error;
  const row = (data ?? {}) as JsonRecord;
  return {
    conflicts: list(row.conflicts).map(toConflict),
    unmatched: list(row.unmatched).map((u) => ({
      childId: text(u.child_id),
      childNameAr: text(u.child_name_ar),
      childNameEn: text(u.child_name_en),
      allergyName: text(u.allergy_name),
      severity: textOrNull(u.severity),
    })),
  };
}
