import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types/enums';
import type {
  BroadcastAudienceScope,
  BroadcastChannel,
  BroadcastMessagesRow,
} from '@/types/tables/batch3';
import type { NotificationChannel } from '@/types/tables/batch4';

const CHANNEL_MAP: Record<BroadcastChannel, NotificationChannel> = {
  in_app: 'in_app',
  whatsapp: 'whatsapp',
  sms: 'sms',
  email: 'email',
};

export async function resolveBroadcastRecipientIds(params: {
  nurseryId: string;
  audienceScope: BroadcastAudienceScope;
  classId: string | null;
  targetRole: UserRole;
}): Promise<string[]> {
  const { nurseryId, audienceScope, classId, targetRole } = params;

  if (audienceScope === 'class') {
    if (!classId) return [];
    const { data: children, error: childErr } = await supabase
      .from('children')
      .select('id')
      .eq('class_id', classId)
      .eq('nursery_id', nurseryId);
    if (childErr) throw childErr;
    const childIds = (children ?? []).map((c: { id: string }) => c.id);
    if (!childIds.length) return [];
    const { data: links, error: linkErr } = await supabase
      .from('parent_children')
      .select('parent_id')
      .in('child_id', childIds);
    if (linkErr) throw linkErr;
    return [
      ...new Set((links ?? []).map((l: { parent_id: string }) => l.parent_id).filter(Boolean)),
    ];
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id')
    .eq('nursery_id', nurseryId)
    .eq('role', targetRole)
    .eq('status', 'active');
  if (error) throw error;
  return (users ?? []).map((u: { id: string }) => u.id).filter(Boolean);
}

async function insertNotificationChunk(
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const { error } = await supabase.from('notifications').insert(rows as never);
  if (error) throw error;
}

export async function fanOutBroadcastNotifications(params: {
  broadcastId: string;
  nurseryId: string;
  recipientUserIds: string[];
  channels: BroadcastChannel[];
  contentAr: string;
  contentEn: string;
  titleAr: string;
  titleEn: string;
  notificationType: 'broadcast' | 'class_announcement';
  /** In-app tap target for the recipient role */
  actionLink: string;
}): Promise<void> {
  const {
    broadcastId,
    nurseryId,
    recipientUserIds,
    channels,
    contentAr,
    contentEn,
    titleAr,
    titleEn,
    notificationType,
    actionLink,
  } = params;
  const rows: Array<Record<string, unknown>> = [];

  for (const uid of recipientUserIds) {
    for (const ch of channels) {
      rows.push({
        nursery_id: nurseryId,
        user_id: uid,
        type: notificationType,
        title_ar: titleAr,
        title_en: titleEn,
        body_ar: contentAr,
        body_en: contentEn,
        channel: CHANNEL_MAP[ch],
        read: false,
        action_link: actionLink,
        related_broadcast_id: broadcastId,
      });
    }
  }

  const chunkSize = 40;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await insertNotificationChunk(rows.slice(i, i + chunkSize));
  }
}

export async function finalizeBroadcastDelivery(params: {
  broadcastId: string;
  recipientCount: number;
}): Promise<void> {
  const { error } = await supabase
    .from('broadcast_messages')
    .update({
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
      recipient_count: params.recipientCount,
    } as never)
    .eq('id', params.broadcastId);
  if (error) throw error;
}

export async function markBroadcastFailed(broadcastId: string): Promise<void> {
  await supabase
    .from('broadcast_messages')
    .update({ delivery_status: 'failed' } as never)
    .eq('id', broadcastId);
}

export type BroadcastInsertPayload = {
  nursery_id: string;
  sender_id: string;
  target_role: UserRole;
  content_ar: string;
  content_en: string;
  audience_scope: BroadcastAudienceScope;
  class_id: string | null;
  channels: BroadcastChannel[];
  scheduled_for: string | null;
  delivery_status: 'draft' | 'scheduled' | 'sent' | 'failed';
  sent_at: string | null;
};

function actionLinkForTargetRole(role: UserRole): string {
  if (role === 'parent') return '/parent/notifications';
  return '/teacher';
}

export async function runBroadcastDeliveryPipeline(params: {
  row: Pick<
    BroadcastMessagesRow,
    | 'id'
    | 'nursery_id'
    | 'audience_scope'
    | 'class_id'
    | 'target_role'
    | 'channels'
    | 'content_ar'
    | 'content_en'
  >;
  titleAr: string;
  titleEn: string;
  notificationType: 'broadcast' | 'class_announcement';
}): Promise<{ recipientCount: number }> {
  const { row, titleAr, titleEn, notificationType } = params;
  const recipientUserIds = await resolveBroadcastRecipientIds({
    nurseryId: row.nursery_id,
    audienceScope: row.audience_scope,
    classId: row.class_id,
    targetRole: row.target_role,
  });

  if (!recipientUserIds.length) {
    await markBroadcastFailed(row.id);
    throw new Error('no_recipients');
  }

  const channels = (row.channels ?? ['in_app']) as BroadcastChannel[];

  await fanOutBroadcastNotifications({
    broadcastId: row.id,
    nurseryId: row.nursery_id,
    recipientUserIds,
    channels,
    contentAr: row.content_ar,
    contentEn: row.content_en,
    titleAr,
    titleEn,
    notificationType,
    actionLink: actionLinkForTargetRole(row.target_role),
  });

  await finalizeBroadcastDelivery({
    broadcastId: row.id,
    recipientCount: recipientUserIds.length,
  });

  return { recipientCount: recipientUserIds.length };
}

export async function processDueScheduledBroadcastsForNursery(
  nurseryId: string,
  titles: {
    broadcast: { titleAr: string; titleEn: string };
    classAnnouncement: { titleAr: string; titleEn: string };
  },
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from('broadcast_messages')
    .select(
      'id, nursery_id, audience_scope, class_id, target_role, channels, content_ar, content_en, delivery_status, scheduled_for',
    )
    .eq('nursery_id', nurseryId)
    .eq('delivery_status', 'scheduled')
    .lte('scheduled_for', nowIso);
  if (error) throw error;

  const rows = (due ?? []) as Pick<
    BroadcastMessagesRow,
    | 'id'
    | 'nursery_id'
    | 'audience_scope'
    | 'class_id'
    | 'target_role'
    | 'channels'
    | 'content_ar'
    | 'content_en'
  >[];

  let n = 0;
  for (const row of rows) {
    try {
      const isClass = row.audience_scope === 'class';
      const t = isClass ? titles.classAnnouncement : titles.broadcast;
      await runBroadcastDeliveryPipeline({
        row,
        titleAr: t.titleAr,
        titleEn: t.titleEn,
        notificationType: isClass ? 'class_announcement' : 'broadcast',
      });
      n += 1;
    } catch {
      await markBroadcastFailed(row.id);
    }
  }
  return n;
}

export async function fetchBroadcastDeliveryStats(broadcastId: string): Promise<{
  inAppSent: number;
  inAppRead: number;
}> {
  const { count: sent, error: errSent } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('related_broadcast_id', broadcastId)
    .eq('channel', 'in_app');
  if (errSent) throw errSent;

  const { count: read, error: errRead } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('related_broadcast_id', broadcastId)
    .eq('channel', 'in_app')
    .eq('read', true);
  if (errRead) throw errRead;

  return { inAppSent: sent ?? 0, inAppRead: read ?? 0 };
}
