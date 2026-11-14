import { count, list, obj, oneOf, text, textOrNull, type JsonRecord } from '@/lib/jsonRead';
import { supabase } from '@/lib/supabase';

import { toConflict } from './foodAlertsApi';
import { isFoodAllergen, MEALS, type FoodAllergen, type Meal, type MenuDish } from './menu';
import type { AllergicChild } from './menuDrafts';
import { MENU_PERIODS, type MenuPeriod } from './menuPeriod';

/*
 * A period's menu through the F&B functions (get_menu_period, save_menu_period, ...). All are RPCs,
 * so a menu opened right after saving shows what was saved (table reads may be cached). Each takes
 * any day of the period; the nursery's kind (a week or a month) decides the period. The menu's file
 * is in menuFileApi, the alerts in foodAlertsApi.
 */

export type MenuInfo = {
  id: string;
  status: 'draft' | 'published';
  notes: string;
  file: { path: string; name: string; type: string; size: number } | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

/** Staff only: the active children with each food allergy, worst reaction first. */
export type AllergyIndex = Partial<Record<FoodAllergen, AllergicChild[]>>;

/** One period's menu as the reader may see it. */
export type Menu = {
  period: MenuPeriod;
  startsOn: string;
  endsOn: string;
  workingDays: string[];
  /** The days the nursery is open in the period (weekdays less holidays), from the server; null from an older one. */
  openDays: string[] | null;
  canEdit: boolean;
  /** Null when there is no menu for the period (or, for a parent, none published yet). */
  info: MenuInfo | null;
  dishes: MenuDish[];
  allergyIndex: AllergyIndex;
};

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

function toMenuInfo(row: JsonRecord): MenuInfo {
  return {
    id: text(row.id),
    status: oneOf(row.status, ['draft', 'published'] as const, 'draft'),
    notes: text(row.notes),
    file: row.file_path ? { path: text(row.file_path), name: text(row.file_name), type: text(row.file_type), size: count(row.file_size) } : null,
    publishedAt: textOrNull(row.published_at),
    updatedAt: textOrNull(row.updated_at),
  };
}

export function toMenu(row: JsonRecord): Menu {
  return {
    period: oneOf(row.period, MENU_PERIODS, 'week'),
    startsOn: text(row.starts_on),
    endsOn: text(row.ends_on),
    workingDays: strings(row.working_days),
    openDays: Array.isArray(row.open_days) ? strings(row.open_days).map((d) => d.slice(0, 10)) : null,
    canEdit: row.can_edit === true,
    info: row.menu && typeof row.menu === 'object' ? toMenuInfo(obj(row.menu)) : null,
    dishes: list(row.dishes).map((d) => ({
      id: text(d.id),
      day: text(d.day),
      meal: oneOf(d.meal, MEALS, 'lunch'),
      name: text(d.name),
      allergens: strings(d.allergens).filter(isFoodAllergen),
      conflicts: list(d.conflicts).map(toConflict),
    })),
    allergyIndex: Object.fromEntries(
      Object.entries(obj(row.allergy_index))
        .filter(([code]) => isFoodAllergen(code))
        .map(([code, children]) => [
          code,
          list(children).map((c) => ({
            childId: text(c.child_id),
            childNameAr: text(c.child_name_ar),
            childNameEn: text(c.child_name_en),
            severity: textOrNull(c.severity),
            eatsNurseryMeals: c.eats_nursery_meals !== false,
          })),
        ]),
    ),
  };
}

/** Calls a menu function that answers with the period's menu. */
async function menuRpc(name: string, args: Record<string, unknown>): Promise<Menu> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return toMenu(obj(data));
}

export const fetchMenu = (nurseryId: string, day: string) => menuRpc('get_menu_period', { p_nursery_id: nurseryId, p_day: day });

export const saveMenu = (input: { nurseryId: string; day: string; notes: string; dishes: Array<{ day: string; meal: Meal; name: string; allergens: string[] }> }) =>
  menuRpc('save_menu_period', { p_nursery_id: input.nurseryId, p_day: input.day, p_notes: input.notes.trim() || null, p_dishes: input.dishes });

export const setMenuPublished = (nurseryId: string, day: string, published: boolean) =>
  menuRpc('set_menu_period_published', { p_nursery_id: nurseryId, p_day: day, p_published: published });

export const copyMenu = (nurseryId: string, fromDay: string, toDay: string) =>
  menuRpc('copy_menu_period', { p_nursery_id: nurseryId, p_from_day: fromDay, p_to_day: toDay });

/** Makes the nursery's menu a week or a month; menus of the other kind are kept, hidden. */
export async function setMenuPeriodKind(nurseryId: string, period: MenuPeriod): Promise<MenuPeriod> {
  const { data, error } = await supabase.rpc('set_menu_period_kind' as never, { p_nursery_id: nurseryId, p_period: period } as never);
  if (error) throw error;
  return oneOf(data, MENU_PERIODS, 'week');
}
