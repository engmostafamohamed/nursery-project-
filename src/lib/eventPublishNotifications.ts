import { supabase } from '@/lib/supabase';

type NotifyInput = {
  eventId: string;
  nurseryId: string;
  titleAr: string;
  titleEn: string;
};

/** Notifies distinct parents linked to children that have a permission row for this event. */
export async function notifyParentsEventPublished(input: NotifyInput): Promise<number> {
  const { data: permRows, error: pErr } = await supabase
    .from('permissions')
    .select('child_id')
    .eq('event_id', input.eventId);
  if (pErr) throw pErr;
  const childIds = [...new Set((permRows ?? []).map((r) => (r as { child_id: string }).child_id))];
  if (!childIds.length) return 0;

  const { data: links, error: lErr } = await supabase
    .from('parent_children')
    .select('parent_id')
    .in('child_id', childIds);
  if (lErr) throw lErr;
  const parentIds = [...new Set((links ?? []).map((r) => (r as { parent_id: string }).parent_id))];
  if (!parentIds.length) return 0;

  const now = new Date().toISOString();
  const actionLink = `/parent/events/${input.eventId}`;
  const inserts = parentIds.map((user_id) => ({
    nursery_id: input.nurseryId,
    user_id,
    type: 'event_published',
    title_ar: 'فعالية جديدة',
    title_en: 'New nursery event',
    body_ar: `تم نشر فعالية: ${input.titleAr}`,
    body_en: `An event was published: ${input.titleEn}`,
    read: false,
    channel: 'in_app' as const,
    sent_at: now,
    action_link: actionLink,
  }));

  const { error: iErr } = await supabase.from('notifications').insert(inserts as never);
  if (iErr) throw iErr;
  return parentIds.length;
}
