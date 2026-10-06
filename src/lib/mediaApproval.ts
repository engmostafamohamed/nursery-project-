import { templateNotificationRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';

interface BaseActionInput {
  mediaId: string;
  adminId: string;
}

async function notifyUser(params: {
  nurseryId: string;
  userId: string;
  type: string;
  params?: Record<string, unknown>;
}) {
  await supabase.from('notifications').insert(
    templateNotificationRow({
      nurseryId: params.nurseryId,
      userId: params.userId,
      type: params.type,
      params: params.params,
      channel: 'push',
    }) as never,
  );
}

async function getMediaContext(mediaId: string) {
  const mediaRes = await supabase
    .from('media')
    .select('id, nursery_id, uploaded_by, class_id, visibility, caption')
    .eq('id', mediaId)
    .maybeSingle();
  if (mediaRes.error) throw mediaRes.error;
  const media = mediaRes.data as {
    id: string;
    nursery_id: string;
    uploaded_by: string;
    class_id: string | null;
    visibility: 'all_class' | 'tagged_only' | 'specific_parents';
    caption: string | null;
  } | null;
  if (!media) throw new Error('Media not found');
  return media;
}

async function parentsForMedia(mediaId: string, visibility: 'all_class' | 'tagged_only' | 'specific_parents', classId: string | null) {
  if (visibility === 'specific_parents') {
    const specificRes = await supabase.from('media_visibility').select('parent_id').eq('media_id', mediaId);
    if (specificRes.error) throw specificRes.error;
    return [...new Set(((specificRes.data ?? []) as { parent_id: string }[]).map((r) => r.parent_id))];
  }
  if (visibility === 'tagged_only') {
    const tagRes = await supabase.from('media_children').select('child_id').eq('media_id', mediaId);
    if (tagRes.error) throw tagRes.error;
    const childIds = ((tagRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
    if (!childIds.length) return [];
    const linksRes = await supabase.from('parent_children').select('parent_id').in('child_id', childIds);
    if (linksRes.error) throw linksRes.error;
    return [...new Set(((linksRes.data ?? []) as { parent_id: string }[]).map((r) => r.parent_id))];
  }
  if (!classId) return [];
  const childRes = await supabase.from('children').select('id').eq('class_id', classId);
  if (childRes.error) throw childRes.error;
  const classChildIds = ((childRes.data ?? []) as { id: string }[]).map((r) => r.id);
  if (!classChildIds.length) return [];
  const linksRes = await supabase.from('parent_children').select('parent_id').in('child_id', classChildIds);
  if (linksRes.error) throw linksRes.error;
  return [...new Set(((linksRes.data ?? []) as { parent_id: string }[]).map((r) => r.parent_id))];
}

export async function approveMedia(input: BaseActionInput) {
  const media = await getMediaContext(input.mediaId);
  const { error } = await supabase
    .from('media')
    .update({
      status: 'approved',
      approved_by: input.adminId,
      approved_at: new Date().toISOString(),
      rejected_reason: null,
    } as never)
    .eq('id', input.mediaId);
  if (error) throw error;

  await notifyUser({
    nurseryId: media.nursery_id,
    userId: media.uploaded_by,
    type: 'media_approved',
  });

  const parentIds = await parentsForMedia(media.id, media.visibility, media.class_id);
  const caption = media.caption?.trim();
  await Promise.all(
    parentIds.map((parentId) =>
      notifyUser({
        nurseryId: media.nursery_id,
        userId: parentId,
        type: 'media_shared',
        // Without a caption the app words it as a class photo.
        params: { caption: caption || { i18n: 'notificationTemplates.media_shared.classPhoto' } },
      }),
    ),
  );
}

export async function rejectMedia(input: BaseActionInput & { reason: string }) {
  const media = await getMediaContext(input.mediaId);
  const { error } = await supabase
    .from('media')
    .update({
      status: 'rejected',
      approved_by: input.adminId,
      approved_at: new Date().toISOString(),
      rejected_reason: input.reason,
    } as never)
    .eq('id', input.mediaId);
  if (error) throw error;
  await notifyUser({
    nurseryId: media.nursery_id,
    userId: media.uploaded_by,
    type: 'media_rejected',
    params: { reason: input.reason },
  });
}

export async function setMediaPending(mediaId: string) {
  const { error } = await supabase
    .from('media')
    .update({
      status: 'pending_approval',
      approved_by: null,
      approved_at: null,
      rejected_reason: null,
    } as never)
    .eq('id', mediaId);
  if (error) throw error;
}

export async function deleteMediaById(mediaId: string) {
  const { error } = await supabase.from('media').delete().eq('id', mediaId);
  if (error) throw error;
}
