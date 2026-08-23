import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { createMediaSignedUrl } from '@/lib/mediaStorage';
import { incrementMediaViewCount } from '@/lib/mediaDownload';
import { supabase } from '@/lib/supabase';

export type ParentMediaSort = 'newest' | 'oldest' | 'most_viewed';
export type ParentMediaFilters = {
  childId?: string;
  fromDate?: string;
  toDate?: string;
  activityType?: string;
  sort: ParentMediaSort;
  limit?: number;
};

export type ParentMediaItem = {
  id: string;
  filePath: string;
  /** Grid tile (thumbnail when available and differs from main file). */
  gridSignedUrl: string;
  signedUrl: string;
  fileType: 'photo' | 'video';
  caption: string | null;
  capturedAt: string;
  uploadedAt: string;
  classId: string | null;
  activityType: string | null;
  viewCount: number;
  downloadCount: number;
  taggedChildren: string[];
  viewedByParent: boolean;
};

const viewedKey = (parentId: string) => `parent-media-viewed-${parentId}`;

function readViewedSet(parentId: string) {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(viewedKey(parentId)) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
}

export function useParentMedia(params: {
  parentId?: string;
  nurseryId?: string;
  filters: ParentMediaFilters;
}) {
  const query = useQuery({
    queryKey: ['parent-media', params.parentId, params.nurseryId, params.filters],
    queryFn: async (): Promise<{ items: ParentMediaItem[]; children: { id: string; name: string }[] }> => {
      if (!params.parentId || !params.nurseryId) return { items: [], children: [] };

      const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', params.parentId);
      if (linksRes.error) throw linksRes.error;
      const parentChildIds = ((linksRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
      if (!parentChildIds.length) return { items: [], children: [] };

      const childRes = await supabase.from('children').select('id, class_id, full_name_ar, full_name_en').in('id', parentChildIds);
      if (childRes.error) throw childRes.error;
      const children = (childRes.data ?? []) as {
        id: string; class_id: string | null; full_name_ar: string | null; full_name_en: string | null;
      }[];
      const childClassMap = new Map(children.map((c) => [c.id, c.class_id]));

      let mediaQ = supabase
        .from('media')
        .select(
          'id, file_url, thumbnail_url, file_type, caption, captured_at, uploaded_at, class_id, activity_type, visibility, view_count, download_count, status',
        )
        .eq('nursery_id', params.nurseryId)
        .eq('status', 'approved');
      if (params.filters.fromDate) mediaQ = mediaQ.gte('captured_at', params.filters.fromDate);
      if (params.filters.toDate) mediaQ = mediaQ.lte('captured_at', params.filters.toDate);
      if (params.filters.activityType) mediaQ = mediaQ.eq('activity_type', params.filters.activityType);
      const mediaRes = await mediaQ;
      if (mediaRes.error) throw mediaRes.error;
      const mediaRows = (mediaRes.data ?? []) as Array<{
        id: string;
        file_url: string;
        thumbnail_url: string | null;
        file_type: 'photo' | 'video';
        caption: string | null;
        captured_at: string;
        uploaded_at: string; class_id: string | null; activity_type: string | null; visibility: 'all_class' | 'tagged_only' | 'specific_parents';
        view_count: number; download_count: number; status: 'approved';
      }>;

      const mediaIds = mediaRows.map((m) => m.id);
      const [tagRes, visRes] = await Promise.all([
        mediaIds.length ? supabase.from('media_children').select('media_id, child_id').in('media_id', mediaIds) : Promise.resolve({ data: [], error: null }),
        mediaIds.length ? supabase.from('media_visibility').select('media_id, parent_id').in('media_id', mediaIds).eq('parent_id', params.parentId) : Promise.resolve({ data: [], error: null }),
      ]);
      if (tagRes.error) throw tagRes.error;
      if (visRes.error) throw visRes.error;

      const tagsByMedia = ((tagRes.data ?? []) as { media_id: string; child_id: string }[]).reduce<Record<string, string[]>>((acc, row) => {
        const list = acc[row.media_id] ?? [];
        list.push(row.child_id);
        acc[row.media_id] = list;
        return acc;
      }, {});
      const visibleMediaByParent = new Set(((visRes.data ?? []) as { media_id: string; parent_id: string }[]).map((v) => v.media_id));
      const parentChildIdSet = new Set(parentChildIds);

      const filtered = mediaRows.filter((m) => {
        const tags = tagsByMedia[m.id] ?? [];
        let hasAccess = false;
        if (m.visibility === 'all_class') {
          hasAccess = parentChildIds.some((cid) => childClassMap.get(cid) && childClassMap.get(cid) === m.class_id);
        } else if (m.visibility === 'tagged_only') {
          hasAccess = tags.some((childId) => parentChildIdSet.has(childId));
        } else {
          hasAccess = visibleMediaByParent.has(m.id);
        }
        if (!hasAccess) return false;
        if (!params.filters.childId) return true;
        if (m.visibility === 'tagged_only') return tags.includes(params.filters.childId);
        return childClassMap.get(params.filters.childId) === m.class_id;
      });

      const viewed = readViewedSet(params.parentId);
      let sorted = filtered.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
      if (params.filters.sort === 'oldest') {
        sorted = filtered.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
      }
      if (params.filters.sort === 'most_viewed') {
        sorted = filtered.sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
      }
      if (params.filters.limit) sorted = sorted.slice(0, params.filters.limit);

      const items = await Promise.all(
        sorted.map(async (m) => {
          const mainSigned = await createMediaSignedUrl(m.file_url);
          const thumbPath = m.thumbnail_url && m.thumbnail_url !== m.file_url ? m.thumbnail_url : m.file_url;
          const gridSigned = thumbPath === m.file_url ? mainSigned : await createMediaSignedUrl(thumbPath);
          return {
          id: m.id,
          filePath: m.file_url,
          gridSignedUrl: gridSigned,
          signedUrl: mainSigned,
          fileType: m.file_type,
          caption: m.caption,
          capturedAt: m.captured_at,
          uploadedAt: m.uploaded_at,
          classId: m.class_id,
          activityType: m.activity_type,
          viewCount: m.view_count ?? 0,
          downloadCount: m.download_count ?? 0,
          taggedChildren: tagsByMedia[m.id] ?? [],
          viewedByParent: viewed.has(m.id),
        };
        }),
      );

      return {
        items,
        children: children.map((c) => ({ id: c.id, name: c.full_name_ar || c.full_name_en || 'Child' })),
      };
    },
    enabled: Boolean(params.parentId && params.nurseryId),
  });

  const stats = useMemo(() => {
    const items = query.data?.items ?? [];
    const currentMonth = new Date().getMonth();
    const thisMonthCount = items.filter((m) => new Date(m.capturedAt).getMonth() === currentMonth).length;
    const lastUploaded = items.length ? items[0].capturedAt : null;
    return { total: items.length, thisMonthCount, lastUploaded };
  }, [query.data]);

  const markViewed = async (media: ParentMediaItem) => {
    if (!params.parentId) return;
    const viewed = readViewedSet(params.parentId);
    if (viewed.has(media.id)) return;
    viewed.add(media.id);
    localStorage.setItem(viewedKey(params.parentId), JSON.stringify(Array.from(viewed)));
    await incrementMediaViewCount(media.id, media.viewCount ?? 0);
  };

  const unseenCount = useMemo(
    () => (query.data?.items ?? []).filter((m) => !m.viewedByParent).length,
    [query.data],
  );

  return {
    ...query,
    media: query.data?.items ?? [],
    children: query.data?.children ?? [],
    stats,
    unseenCount,
    markViewed,
  };
}
