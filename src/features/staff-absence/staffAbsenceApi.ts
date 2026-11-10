/* Staff absences over the network: reads and writes are database functions (so a change shows at once). */
import { errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

import { toMyAbsences, toStaffAbsences, type AbsenceDraft, type MyAbsences, type StaffAbsences } from './staffAbsence';

export async function fetchMyAbsences(): Promise<MyAbsences> {
  const { data, error } = await supabase.rpc('get_my_absences' as never);
  if (error) throw error;
  return toMyAbsences(data);
}

export async function fetchStaffAbsences(nurseryId: string, from: string, to: string): Promise<StaffAbsences> {
  const { data, error } = await supabase.rpc('get_staff_absences' as never, { p_nursery_id: nurseryId, p_from: from, p_to: to } as never);
  if (error) throw error;
  return toStaffAbsences(data);
}

/** Reports an absence: the caller's own (`userId` empty) or, for an admin, someone else's. */
export async function reportAbsence(d: AbsenceDraft): Promise<void> {
  const { error } = await supabase.rpc('report_staff_absence' as never, {
    p_user_id: d.userId || null,
    p_starts_on: d.startsOn,
    p_ends_on: d.endsOn,
    p_reason: d.reason,
    p_note: d.note.trim() || null,
  } as never);
  if (error) throw error;
}

export async function cancelAbsence(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_staff_absence' as never, { p_absence_id: id } as never);
  if (error) throw error;
}

const ABSENCE_CODES = ['absence_forbidden', 'absence_invalid_dates', 'absence_invalid_reason', 'absence_overlaps', 'absence_closed', 'absence_note_too_long'] as const;

/** The text key for a failed read or write (staffAbsence.errors.<code without absence_>, network, failed). */
export const absenceErrorKey = (error: unknown): string => errorTextKey(error, ABSENCE_CODES, 'staffAbsence.errors', 'absence_');
