import { supabase } from '@/lib/supabase';

import { syncEventChildren } from './eventFlowApi';

/*
 * The admin's plain reads and changes of event rows; the steps families hear about, who is asked,
 * and deleting (a soft delete) go through eventFlowApi.
 */

/** The children an event asks (its requests not withdrawn). */
export async function askedChildIds(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('permissions').select('child_id').eq('event_id', eventId);
  if (error) throw error;
  return [...new Set(((data ?? []) as { child_id: string }[]).map((r) => r.child_id))];
}

const COPY_COLUMNS =
  'title_ar, title_en, description_ar, description_en, starts_at, ends_at, location, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, is_paid, price, target_scope, target_class_id, permission_deadline';

/** A new draft with the same details, its titles marked as a copy; returns the copy's id. */
export async function duplicateEvent(eventId: string, nurseryId: string, suffix: { ar: string; en: string }): Promise<string> {
  const { data, error } = await supabase.from('events').select(COPY_COLUMNS).eq('id', eventId).eq('nursery_id', nurseryId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('not_found');
  const row = data as Record<string, unknown> & { title_ar: string; title_en: string };
  const { data: inserted, error: insertError } = await supabase
    .from('events')
    .insert({
      ...row,
      nursery_id: nurseryId,
      title_ar: `${row.title_ar} (${suffix.ar})`,
      title_en: `${row.title_en} (${suffix.en})`,
      status: 'draft',
      cancelled_at: null,
    } as never)
    .select('id')
    .maybeSingle();
  if (insertError) throw insertError;
  const id = (inserted as { id: string } | null)?.id;
  if (!id) throw new Error('no_event_id');
  // Children chosen by name are kept as the event's requests: the copy (a draft) asks the same ones.
  if (row.target_scope === 'individual') await syncEventChildren(id, await askedChildIds(eventId));
  return id;
}
