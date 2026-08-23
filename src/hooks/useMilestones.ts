import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type MilestoneCategory = 'motor_skills' | 'social' | 'cognitive' | 'language' | 'self_care' | 'creative';

export const MILESTONE_TEMPLATES: Record<string, string[]> = {
  '1-2': ['Walked independently', 'Said first words', 'Waved bye', 'Drank from cup', 'Climbed stairs'],
  '2-3': ['Used potty', '2-word phrases', 'Shared toys', 'Jumped with both feet'],
  '3-4': ['Counted to 10', 'Recognized colors', 'Dressed self', 'Used scissors', 'Drew person'],
};

export type MilestoneItem = {
  id: string;
  nursery_id: string;
  child_id: string;
  teacher_id: string;
  category: MilestoneCategory;
  milestone_text: string;
  achieved_at: string;
  notes: string | null;
  photo_url: string | null;
  shared_with_parent: boolean;
  created_at: string;
  childName?: string;
};

export function useMilestones(params: { userId?: string; nurseryId?: string; role: 'teacher' | 'parent' | 'admin' }) {
  const qc = useQueryClient();
  const classesQuery = useQuery({
    queryKey: ['milestone-classes', params.userId, params.nurseryId, params.role],
    queryFn: async () => {
      if (!params.nurseryId) return [];
      if (params.role === 'teacher') {
        if (!params.userId) return [];
        const staffRes = await supabase
          .from('class_staff')
          .select('class_id')
          .eq('user_id', params.userId);
        if (staffRes.error) throw staffRes.error;
        const classIds = Array.from(
          new Set(((staffRes.data ?? []) as { class_id: string }[]).map((r) => r.class_id)),
        );
        if (!classIds.length) return [];
        const res = await supabase
          .from('classes')
          .select('id, name_ar, name_en')
          .eq('nursery_id', params.nurseryId)
          .in('id', classIds);
        if (res.error) throw res.error;
        return (res.data ?? []) as { id: string; name_ar: string; name_en: string }[];
      }
      const res = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', params.nurseryId);
      if (res.error) throw res.error;
      return (res.data ?? []) as { id: string; name_ar: string; name_en: string }[];
    },
    enabled: Boolean(params.nurseryId),
  });

  const childrenQuery = useQuery({
    queryKey: ['milestone-children', params.userId, params.role, classesQuery.data],
    queryFn: async () => {
      if (params.role === 'parent' && params.userId) {
        const links = await supabase.from('parent_children').select('child_id').eq('parent_id', params.userId);
        if (links.error) throw links.error;
        const ids = ((links.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
        if (!ids.length) return [];
        const res = await supabase.from('children').select('id, full_name_ar, full_name_en, dob, class_id').in('id', ids);
        if (res.error) throw res.error;
        return (res.data ?? []) as { id: string; full_name_ar: string; full_name_en: string; dob: string; class_id: string | null }[];
      }
      const classIds = (classesQuery.data ?? []).map((c) => c.id);
      if (!classIds.length) return [];
      const res = await supabase.from('children').select('id, full_name_ar, full_name_en, dob, class_id').in('class_id', classIds);
      if (res.error) throw res.error;
      return (res.data ?? []) as { id: string; full_name_ar: string; full_name_en: string; dob: string; class_id: string | null }[];
    },
    enabled: params.role === 'parent' ? Boolean(params.userId) : Boolean(classesQuery.data?.length),
  });

  const listQuery = useQuery({
    queryKey: ['milestones-list', params, (childrenQuery.data ?? []).map((c) => c.id)],
    queryFn: async (): Promise<MilestoneItem[]> => {
      if (!params.nurseryId) return [];
      let q = supabase.from('milestones').select('*').eq('nursery_id', params.nurseryId).order('achieved_at', { ascending: false });
      if (params.role === 'teacher') {
        // Scope to children in classes the teacher leads or assists in
        // (covers both lead and assistant via class_staff -> children).
        const childIds = (childrenQuery.data ?? []).map((c) => c.id);
        if (!childIds.length) return [];
        q = q.in('child_id', childIds);
      }
      if (params.role === 'parent') q = q.eq('shared_with_parent', true);
      const res = await q;
      if (res.error) throw res.error;
      const rows = (res.data ?? []) as MilestoneItem[];
      const childMap = new Map((childrenQuery.data ?? []).map((c) => [c.id, c.full_name_ar || c.full_name_en]));
      return rows.map((r) => ({ ...r, childName: childMap.get(r.child_id) ?? 'Child' }));
    },
    enabled: Boolean(params.nurseryId) && (params.role !== 'teacher' || childrenQuery.isFetched),
  });

  const upsertMilestone = useMutation({
    mutationFn: async (input: Omit<MilestoneItem, 'id' | 'created_at'> & { id?: string }) => {
      const payload = { ...input };
      if (input.id) {
        const res = await supabase.from('milestones').update(payload as never).eq('id', input.id);
        if (res.error) throw res.error;
        return input.id;
      }
      const res = await supabase.from('milestones').insert(payload as never).select('id').single();
      if (res.error) throw res.error;
      return (res.data as { id: string }).id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['milestones-list'] }),
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('milestones').delete().eq('id', id);
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['milestones-list'] }),
  });

  const childAgeMap = useMemo(() => {
    const map = new Map<string, number>();
    (childrenQuery.data ?? []).forEach((c) => {
      const d = new Date(c.dob);
      const n = new Date();
      let age = n.getFullYear() - d.getFullYear();
      if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) age -= 1;
      map.set(c.id, Math.max(0, age));
    });
    return map;
  }, [childrenQuery.data]);

  return {
    classes: classesQuery.data ?? [],
    children: childrenQuery.data ?? [],
    milestones: listQuery.data ?? [],
    childAgeMap,
    isLoading: listQuery.isLoading || childrenQuery.isLoading,
    saveMilestone: upsertMilestone.mutateAsync,
    deleteMilestone: deleteMilestone.mutateAsync,
  };
}
