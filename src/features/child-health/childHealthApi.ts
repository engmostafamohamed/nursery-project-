/*
 * The child's health profile over the network: one read (get_child_health_profile, a function so a
 * change shows at once) and the writes. The overview is saved by save_child_health_overview; the
 * allergies, conditions, medicines and vaccinations are rows the branch's admins may change.
 */
import { isFoodAllergen, type FoodAllergen } from '@/features/food-and-beverage/menu';
import { errorCodeIn, errorMessage, errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

import {
  overviewPayload,
  toChildHealthProfile,
  type AllergyDraft,
  type ChildHealthProfile,
  type ConditionDraft,
  type MedicationDraft,
  type OverviewDraft,
  type VaccinationDraft,
} from './childHealth';

export async function fetchChildHealthProfile(childId: string): Promise<ChildHealthProfile> {
  const { data, error } = await supabase.rpc('get_child_health_profile' as never, { p_child_id: childId } as never);
  if (error) throw error;
  return toChildHealthProfile(data);
}

export async function saveHealthOverview(childId: string, draft: OverviewDraft): Promise<void> {
  const { error } = await supabase.rpc('save_child_health_overview' as never, { p_child_id: childId, p_fields: overviewPayload(draft) } as never);
  if (error) throw error;
}

/** The menu foods an allergy's name covers, as the database reads them (food_allergens_for). */
export async function suggestFoodAllergens(name: string): Promise<FoodAllergen[]> {
  if (!name.trim()) return [];
  const { data, error } = await supabase.rpc('food_allergens_for' as never, { p_text: name } as never);
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown[]).filter((v): v is FoodAllergen => typeof v === 'string' && isFoodAllergen(v)) : [];
}

export type HealthItemKind ='allergy' | 'condition' | 'medication' | 'vaccination';
const TABLES: Record<HealthItemKind, string> = {
  allergy: 'child_allergies',
  condition: 'child_chronic_conditions',
  medication: 'child_medications',
  vaccination: 'child_vaccinations',
};

const orNull = (value: string) => value.trim() || null;

export function allergyRow(d: AllergyDraft) {
  return {
    allergen_name: d.name.trim(),
    reaction_type: orNull(d.reaction),
    severity: d.severity,
    treatment_protocol: orNull(d.treatment),
    last_reaction_date: d.lastReactionDate || null,
    food_allergens: d.foodAllergens,
  };
}

export function conditionRow(d: ConditionDraft) {
  return {
    condition_name: d.name.trim(),
    severity: orNull(d.severity),
    diagnosis_date: d.diagnosisDate || null,
    treatment_protocol: orNull(d.treatment),
    trigger_factors: orNull(d.triggers),
    emergency_response_plan: orNull(d.emergencyPlan),
  };
}

export function medicationRow(d: MedicationDraft) {
  return {
    name: d.name.trim(),
    dosage: orNull(d.dosage),
    administration_times: orNull(d.times),
    administration_method: d.method,
    storage_requirements: orNull(d.storage),
    expiry_date: d.expiryDate || null,
    parent_consent_status: d.consent,
    dose_times: d.doseTimes.filter(Boolean),
    starts_on: d.startsOn || null,
    ends_on: d.endsOn || null,
  };
}

/** `vaccineName` is the preset's name in the reader's language, or the name typed in. */
export function vaccinationRow(d: VaccinationDraft, vaccineName: string) {
  return {
    vaccine_name: vaccineName.trim(),
    dose_number: Number(d.dose),
    date_administered: d.givenOn || null,
    next_due_date: d.nextDue || null,
    administered_by: orNull(d.givenBy),
    batch_number: orNull(d.batch),
  };
}

/** Adds an item to the child's record (`id` null) or changes one. */
export async function saveHealthItem(
  kind: HealthItemKind,
  target: { childId: string; nurseryId: string; id: string | null },
  row: Record<string, unknown>,
): Promise<void> {
  const table = supabase.from(TABLES[kind] as never);
  const { error } = target.id
    ? await table.update(row as never).eq('id' as never, target.id as never)
    : await table.insert({ ...row, child_id: target.childId, nursery_id: target.nurseryId } as never);
  if (error) throw error;
}

export async function deleteHealthItem(kind: HealthItemKind, id: string): Promise<void> {
  const { error } = await supabase.from(TABLES[kind] as never).delete().eq('id' as never, id as never);
  if (error) throw error;
}

const HEALTH_CODES = ['health_forbidden', 'health_phone_invalid', 'health_contact_incomplete', 'health_blood_type_invalid', 'health_text_too_long'] as const;

/** A write the table's own rules refused (no health code of ours in it). */
const refusedByTableRules = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === '42501' || /row-level security|permission denied/i.test(errorMessage(error));

/** The text key for a failed read or write (health.profile.errors.<code without health_>, forbidden, network, failed). */
export function healthErrorKey(error: unknown): string {
  if (!errorCodeIn(error, HEALTH_CODES) && refusedByTableRules(error)) return 'health.profile.errors.forbidden';
  return errorTextKey(error, HEALTH_CODES, 'health.profile.errors', 'health_');
}
