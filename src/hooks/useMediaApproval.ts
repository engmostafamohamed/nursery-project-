import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { createMediaSignedUrl } from '@/lib/mediaStorage';
import { supabase } from '@/lib/supabase';

export type MediaStatusTab = 'all' | 'pending_approval' | 'approved' | 'rejected';

export type AdminMediaItem = {
  id: string;
  nurseryId: string;
  uploadedBy: string;
  teacherName: string;
  fileUrl: string;
  signedUrl: string;
  fileType: 'photo' | 'video';
  uploadedAt: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  classId: string | null;
  className: string;
  taggedCount: number;
  taggedChildNames: string[];
  caption: string | null;
  activityType: string | null;
  visibility: 'all_class' | 'tagged_only' | 'specific_parents';
  viewCount: number;
  rejectedReason: string | null;
};

interface Params {
  nurseryId?: string;
  status: MediaStatusTab;
  classId?: string;
  teacherId?: string;
  fromDate?: string;
  toDate?: string;
}

export function useMediaApproval(params: Params) {
  const query = useQuery({
    queryKey: ['admin-media-approval', params],
    queryFn: async (): Promise<AdminMediaItem[]> => {
      if (!params.nurseryId) return [];
      let q = supabase
        .from('media')
        .select('id, nursery_id, uploaded_by, file_url, file_type, uploaded_at, status, class_id, caption, activity_type, visibility, view_count, rejected_reason')
        .eq('nursery_id', params.nurseryId)
        .order('uploaded_at', { ascending: false });
      if (params.status !== 'all') q = q.eq('status', params.status);
      if (params.classId) q = q.eq('class_id', params.classId);
      if (params.teacherId) q = q.eq('uploaded_by', params.teacherId);
      if (params.fromDate) q = q.gte('uploaded_at', `${params.fromDate}T00:00:00`);
      if (params.toDate) q = q.lte('uploaded_at', `${params.toDate}T23:59:59`);
      const mediaRes = await q;
      if (mediaRes.error) throw mediaRes.error;
      const rows = (mediaRes.data ?? []) as Array<{
        id: string;
        nursery_id: string;
        uploaded_by: string;
        file_url: string;
        file_type: 'photo' | 'video';
        uploaded_at: string;
        status: 'pending_approval' | 'approved' | 'rejected';
        class_id: string | null;
        caption: string | null;
        activity_type: string | null;
        visibility: 'all_class' | 'tagged_only' | 'specific_parents';
        view_count: number;
        rejected_reason: string | null;
      }>;

      const teacherIds = [...new Set(rows.map((r) => r.uploaded_by))];
      const classIds = [...new Set(rows.map((r) => r.class_id).filter(Boolean))] as string[];
      const mediaIds = rows.map((r) => r.id);

      const [teachersRes, classesRes, tagsRes] = await Promise.all([
        teacherIds.length ? supabase.from('users').select('id, full_name_ar:name_ar, full_name_en:name_en').in('id', teacherIds) : Promise.resolve({ data: [], error: null }),
        classIds.length ? supabase.from('classes').select('id, name_ar, name_en').in('id', classIds) : Promise.resolve({ data: [], error: null }),
        mediaIds.length ? supabase.from('media_children').select('media_id, child_id').in('media_id', mediaIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (teachersRes.error) throw teachersRes.error;
      if (classesRes.error) throw classesRes.error;
      if (tagsRes.error) throw tagsRes.error;

      const tagRows = (tagsRes.data ?? []) as { media_id: string; child_id: string }[];
      const taggedChildIds = [...new Set(tagRows.map((r) => r.child_id))];
      const childrenTaggedRes =
        taggedChildIds.length > 0
          ? await supabase.from('children').select('id, full_name_ar, full_name_en').in('id', taggedChildIds)
          : { data: [], error: null as null };
      if (childrenTaggedRes.error) throw childrenTaggedRes.error;
      const childNameMap = new Map(
        ((childrenTaggedRes.data ?? []) as { id: string; full_name_ar: string | null; full_name_en: string | null }[]).map((c) => [
          c.id,
          c.full_name_ar || c.full_name_en || '—',
        ]),
      );
      const namesByMedia = tagRows.reduce<Record<string, string[]>>((acc, row) => {
        const list = acc[row.media_id] ?? [];
        const n = childNameMap.get(row.child_id);
        if (n) list.push(n);
        acc[row.media_id] = list;
        return acc;
      }, {});

      const teacherMap = new Map(
        ((teachersRes.data ?? []) as { id: string; full_name_ar: string | null; full_name_en: string | null }[]).map((u) => [u.id, u.full_name_ar || u.full_name_en || 'Teacher']),
      );
      const classMap = new Map(
        ((classesRes.data ?? []) as { id: string; name_ar: string; name_en: string }[]).map((c) => [c.id, c.name_ar || c.name_en]),
      );
      const tagsCountMap = tagRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.media_id] = (acc[row.media_id] ?? 0) + 1;
        return acc;
      }, {});

      return Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          nurseryId: row.nursery_id,
          uploadedBy: row.uploaded_by,
          teacherName: teacherMap.get(row.uploaded_by) ?? 'Teacher',
          fileUrl: row.file_url,
          signedUrl: await createMediaSignedUrl(row.file_url),
          fileType: row.file_type,
          uploadedAt: row.uploaded_at,
          status: row.status,
          classId: row.class_id,
          className: row.class_id ? classMap.get(row.class_id) ?? '-' : '-',
          taggedCount: tagsCountMap[row.id] ?? 0,
          taggedChildNames: namesByMedia[row.id] ?? [],
          caption: row.caption,
          activityType: row.activity_type,
          visibility: row.visibility,
          viewCount: row.view_count ?? 0,
          rejectedReason: row.rejected_reason,
        })),
      );
    },
    enabled: Boolean(params.nurseryId),
  });

  const pendingCount = useMemo(
    () => (query.data ?? []).filter((m) => m.status === 'pending_approval').length,
    [query.data],
  );

  return {
    ...query,
    media: query.data ?? [],
    pendingCount,
  };
}
