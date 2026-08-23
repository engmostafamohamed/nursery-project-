import { supabase } from '@/lib/supabase';

export async function notifyNurseryAdmins(params: {
  nurseryId: string;
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  actionLink?: string | null;
}): Promise<void> {
  const adminUsers = await supabase
    .from('users')
    .select('id')
    .eq('nursery_id', params.nurseryId)
    .in('role', ['branch_admin', 'chain_super_admin']);
  if (adminUsers.error) throw adminUsers.error;
  const rows = (adminUsers.data ?? []) as { id: string }[];
  if (!rows.length) return;
  const sentAt = new Date().toISOString();
  const payload = rows.map((admin) => ({
    nursery_id: params.nurseryId,
    user_id: admin.id,
    type: params.type,
    title_ar: params.titleAr,
    title_en: params.titleEn,
    body_ar: params.bodyAr,
    body_en: params.bodyEn,
    read: false,
    channel: 'push' as const,
    sent_at: sentAt,
    action_link: params.actionLink ?? null,
  }));
  const { error } = await supabase.from('notifications').insert(payload as never);
  if (error) throw error;
}

export async function notifyParentUsers(params: {
  nurseryId: string;
  parentUserIds: string[];
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  actionLink?: string | null;
}): Promise<void> {
  const unique = [...new Set(params.parentUserIds)];
  if (!unique.length) return;
  const sentAt = new Date().toISOString();
  const payload = unique.map((userId) => ({
    nursery_id: params.nurseryId,
    user_id: userId,
    type: params.type,
    title_ar: params.titleAr,
    title_en: params.titleEn,
    body_ar: params.bodyAr,
    body_en: params.bodyEn,
    read: false,
    channel: 'push' as const,
    sent_at: sentAt,
    action_link: params.actionLink ?? null,
  }));
  const { error } = await supabase.from('notifications').insert(payload as never);
  if (error) throw error;
}

export async function fetchParentUserIdsForChild(childId: string): Promise<string[]> {
  const res = await supabase.from('parent_children').select('parent_id').eq('child_id', childId);
  if (res.error) throw res.error;
  return ((res.data ?? []) as { parent_id: string }[]).map((r) => r.parent_id);
}
