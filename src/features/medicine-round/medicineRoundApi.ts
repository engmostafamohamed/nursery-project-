/* Today's medicine round over the network (database functions, so a dose shows the moment it is recorded). */
import { errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

import { toRound, type Round, type SkipReason } from './medicineRound';

export async function fetchMedicineRound(nurseryId: string | null): Promise<Round> {
  const { data, error } = await supabase.rpc('get_medication_round' as never, (nurseryId ? { p_nursery_id: nurseryId } : {}) as never);
  if (error) throw error;
  return toRound(data);
}

export async function recordDose(input: { medicationId: string; time: string | null; status: 'given' | 'skipped'; reason?: SkipReason | null; note?: string }): Promise<void> {
  const { error } = await supabase.rpc('record_medication_dose' as never, {
    p_medication_id: input.medicationId,
    p_scheduled_time: input.time,
    p_status: input.status,
    p_skip_reason: input.status === 'skipped' ? input.reason ?? null : null,
    p_note: input.note?.trim() || null,
  } as never);
  if (error) throw error;
}

export async function undoDose(doseId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_medication_dose' as never, { p_dose_id: doseId } as never);
  if (error) throw error;
}

const CODES = ['medication_forbidden', 'medication_invalid', 'medication_no_consent', 'medication_not_active', 'medication_child_not_here', 'medication_already_recorded', 'medication_undo_closed'] as const;

/** The text key for a failed call (medicineRound.errors.<code without medication_>, network, failed). */
export const roundErrorKey = (error: unknown): string => errorTextKey(error, CODES, 'medicineRound.errors', 'medication_');
