import { supabase } from '@/lib/supabase';

import { isFoodAllergen, MEALS, type AllergicChild, type FoodAllergen, type FoodConflict, type Meal, type MenuDish } from './menu';

/*
 * The menu and its alerts through the F&B functions (get_menu_week, save_menu_week, ...). All are
 * RPCs, so a week opened right after saving shows what was saved (table reads may be cached).
 */

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const meal = (v: unknown): Meal => ((MEALS as readonly string[]).includes(str(v)) ? (str(v) as Meal) : 'lunch');

export function toConflict(row: Json): FoodConflict {
  const allergen = str(row.allergen);
  return {
    dishId: str(row.dish_id),
    day: str(row.day),
    meal: meal(row.meal),
    dishName: str(row.dish_name),
    weekStatus: row.week_status === 'published' ? 'published' : 'draft',
    childId: str(row.child_id),
    childNameAr: str(row.child_name_ar),
    childNameEn: str(row.child_name_en),
    classNameAr: strOrNull(row.class_name_ar),
    classNameEn: strOrNull(row.class_name_en),
    allergen: isFoodAllergen(allergen) ? allergen : 'milk',
    allergyName: str(row.allergy_name),
    severity: strOrNull(row.severity),
    reaction: strOrNull(row.reaction),
    treatment: strOrNull(row.treatment),
    eatsNurseryMeals: row.eats_nursery_meals !== false,
  };
}

export type MenuWeekInfo = {
  id: string;
  status: 'draft' | 'published';
  notes: string;
  file: { path: string; name: string; type: string; size: number } | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

/** Staff only: the active children with each food allergy, worst reaction first. */
export type AllergyIndex = Partial<Record<FoodAllergen, AllergicChild[]>>;

export type MenuWeek = {
  weekStart: string;
  workingDays: string[];
  canEdit: boolean;
  /** Null when there is no menu for the week (or, for a parent, none published yet). */
  week: MenuWeekInfo | null;
  dishes: MenuDish[];
  allergyIndex: AllergyIndex;
};

export function toMenuWeek(row: Json): MenuWeek {
  const week = row.week && typeof row.week === 'object' ? (row.week as Json) : null;
  return {
    weekStart: str(row.week_start),
    workingDays: Array.isArray(row.working_days) ? (row.working_days as unknown[]).filter((d): d is string => typeof d === 'string') : [],
    canEdit: row.can_edit === true,
    week: week
      ? {
          id: str(week.id),
          status: week.status === 'published' ? 'published' : 'draft',
          notes: str(week.notes),
          file: week.file_path
            ? { path: str(week.file_path), name: str(week.file_name), type: str(week.file_type), size: Number(week.file_size) || 0 }
            : null,
          publishedAt: strOrNull(week.published_at),
          updatedAt: strOrNull(week.updated_at),
        }
      : null,
    dishes: list(row.dishes).map((d) => ({
      id: str(d.id),
      day: str(d.day),
      meal: meal(d.meal),
      name: str(d.name),
      allergens: Array.isArray(d.allergens) ? (d.allergens as unknown[]).filter((a): a is string => typeof a === 'string').filter(isFoodAllergen) : [],
      conflicts: list(d.conflicts).map(toConflict),
    })),
    allergyIndex: Object.fromEntries(
      Object.entries((row.allergy_index ?? {}) as Record<string, unknown>)
        .filter(([code]) => isFoodAllergen(code))
        .map(([code, children]) => [
          code,
          list(children).map((c) => ({
            childId: str(c.child_id),
            childNameAr: str(c.child_name_ar),
            childNameEn: str(c.child_name_en),
            severity: strOrNull(c.severity),
            eatsNurseryMeals: c.eats_nursery_meals !== false,
          })),
        ]),
    ),
  };
}

export async function fetchMenuWeek(nurseryId: string, weekStart: string): Promise<MenuWeek> {
  const { data, error } = await supabase.rpc('get_menu_week' as never, { p_nursery_id: nurseryId, p_week_start: weekStart } as never);
  if (error) throw error;
  return toMenuWeek(data as Json);
}

export async function saveMenuWeek(input: {
  nurseryId: string;
  weekStart: string;
  notes: string;
  dishes: Array<{ day: string; meal: Meal; name: string; allergens: string[] }>;
}): Promise<MenuWeek> {
  const { data, error } = await supabase.rpc('save_menu_week' as never, {
    p_nursery_id: input.nurseryId,
    p_week_start: input.weekStart,
    p_notes: input.notes.trim() || null,
    p_dishes: input.dishes,
  } as never);
  if (error) throw error;
  return toMenuWeek(data as Json);
}

export async function setMenuWeekPublished(nurseryId: string, weekStart: string, published: boolean): Promise<MenuWeek> {
  const { data, error } = await supabase.rpc('set_menu_week_published' as never, {
    p_nursery_id: nurseryId,
    p_week_start: weekStart,
    p_published: published,
  } as never);
  if (error) throw error;
  return toMenuWeek(data as Json);
}

export async function copyMenuWeek(nurseryId: string, fromWeek: string, toWeek: string): Promise<MenuWeek> {
  const { data, error } = await supabase.rpc('copy_menu_week' as never, { p_nursery_id: nurseryId, p_from_week: fromWeek, p_to_week: toWeek } as never);
  if (error) throw error;
  return toMenuWeek(data as Json);
}

const BUCKET = 'menu-files';

/**
 * Stores a week's menu file: upload, point the week at it, then delete the file it replaces. When
 * pointing fails the new upload is removed again, so nothing is left behind.
 */
export async function replaceMenuFile(input: { nurseryId: string; weekStart: string; path: string; file: File }): Promise<MenuWeek> {
  const upload = await supabase.storage.from(BUCKET).upload(input.path, input.file, { contentType: input.file.type, upsert: false });
  if (upload.error) throw upload.error;
  const { data, error } = await supabase.rpc('set_menu_week_file' as never, {
    p_nursery_id: input.nurseryId,
    p_week_start: input.weekStart,
    p_path: input.path,
    p_name: input.file.name,
    p_type: input.file.type,
    p_size: input.file.size,
  } as never);
  if (error) {
    await supabase.storage.from(BUCKET).remove([input.path]);
    throw error;
  }
  const result = data as { previous_path: string | null; menu: Json };
  if (result.previous_path) await supabase.storage.from(BUCKET).remove([result.previous_path]);
  return toMenuWeek(result.menu);
}

export async function removeMenuFile(nurseryId: string, weekStart: string): Promise<MenuWeek> {
  const { data, error } = await supabase.rpc('set_menu_week_file' as never, {
    p_nursery_id: nurseryId,
    p_week_start: weekStart,
    p_path: null,
    p_name: null,
    p_type: null,
    p_size: null,
  } as never);
  if (error) throw error;
  const result = data as { previous_path: string | null; menu: Json };
  if (result.previous_path) await supabase.storage.from(BUCKET).remove([result.previous_path]);
  return toMenuWeek(result.menu);
}

/** A link to the file that works for a few minutes (the bucket is private). */
export async function menuFileUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw error ?? new Error('menu_file_unavailable');
  return data.signedUrl;
}

export type FoodAlerts = {
  conflicts: FoodConflict[];
  /** Children's allergies that name no food allergen: the menu is not checked against them. */
  unmatched: Array<{ childId: string; childNameAr: string; childNameEn: string; allergyName: string; severity: string | null }>;
};

export async function fetchFoodAlerts(input: { nurseryId: string; from: string; to: string; childId?: string }): Promise<FoodAlerts> {
  const { data, error } = await supabase.rpc('get_food_allergy_alerts' as never, {
    p_nursery_id: input.nurseryId,
    p_from: input.from,
    p_to: input.to,
    p_child_id: input.childId ?? null,
  } as never);
  if (error) throw error;
  const row = (data ?? {}) as Json;
  return {
    conflicts: list(row.conflicts).map(toConflict),
    unmatched: list(row.unmatched).map((u) => ({
      childId: str(u.child_id),
      childNameAr: str(u.child_name_ar),
      childNameEn: str(u.child_name_en),
      allergyName: str(u.allergy_name),
      severity: strOrNull(u.severity),
    })),
  };
}

const MENU_ERROR_CODES = [
  'menu_forbidden',
  'menu_invalid_dishes',
  'menu_invalid_dish',
  'menu_invalid_allergen',
  'menu_notes_too_long',
  'menu_week_empty',
  'menu_week_not_empty',
  'menu_copy_source_empty',
  'menu_invalid_file',
] as const;

/** The translation key for an F&B function error (fnb.errors.<code>). */
export function menuErrorKey(error: unknown): string {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : String(error ?? '');
  const code = MENU_ERROR_CODES.find((c) => message.includes(c));
  return code ? `fnb.errors.${code}` : 'fnb.errors.failed';
}
