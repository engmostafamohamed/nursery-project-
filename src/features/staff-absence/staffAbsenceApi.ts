/* Staff absences over the network: reads and writes are database functions (so a change shows at once). */
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

/** The text key for a failed read or write. */
export function absenceErrorKey(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  const known = ['absence_forbidden', 'absence_invalid_dates', 'absence_invalid_reason', 'absence_overlaps', 'absence_closed', 'absence_note_too_long'];
  const hit = known.find((k) => message.includes(k));
  if (hit) return `staffAbsence.errors.${hit.replace('absence_', '')}`;
  if (/failed to fetch|network|load failed/i.test(message)) return 'staffAbsence.errors.network';
  return 'staffAbsence.errors.failed';
}
