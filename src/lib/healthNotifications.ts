import { templateNotificationRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';

/** Notifications use `type` as their template (notificationTemplates.<type>) with `params`. */
export async function notifyNurseryAdmins(params: {
  nurseryId: string;
  type: string;
  params?: Record<string, unknown>;
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
  const payload = rows.map((admin) =>
    templateNotificationRow({
      nurseryId: params.nurseryId,
      userId: admin.id,
      type: params.type,
      params: params.params,
      actionLink: params.actionLink ?? null,
      channel: 'push',
    }),
  );
  const { error } = await supabase.from('notifications').insert(payload as never);
  if (error) throw error;
}

export async function notifyParentUsers(params: {
  nurseryId: string;
  parentUserIds: string[];
  type: string;
  params?: Record<string, unknown>;
  actionLink?: string | null;
}): Promise<void> {
  const unique = [...new Set(params.parentUserIds)];
  if (!unique.length) return;
  const payload = unique.map((userId) =>
    templateNotificationRow({
      nurseryId: params.nurseryId,
      userId,
      type: params.type,
      params: params.params,
      actionLink: params.actionLink ?? null,
      channel: 'push',
    }),
  );
  const { error } = await supabase.from('notifications').insert(payload as never);
  if (error) throw error;
}

export async function fetchParentUserIdsForChild(childId: string): Promise<string[]> {
  const res = await supabase.from('parent_children').select('parent_id').eq('child_id', childId);
  if (res.error) throw res.error;
  return ((res.data ?? []) as { parent_id: string }[]).map((r) => r.parent_id);
}
