import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { removeMilestone, saveMilestone, type MilestoneDraft } from '@/features/milestones/milestonesApi';
import { supabase } from '@/lib/supabase';

export type MilestoneCategory = 'motor_skills' | 'social' | 'cognitive' | 'language' | 'self_care' | 'creative';

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
    enabled: Boolean(params.nurseryId) && params.role !== 'parent',
  });

  const childrenQuery = useQuery({
    queryKey: ['milestone-children', params.userId, params.role, params.role === 'parent' ? null : classesQuery.data],
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

  const childIds = useMemo(() => (childrenQuery.data ?? []).map((c) => c.id), [childrenQuery.data]);
  const listQuery = useQuery({
    queryKey: ['milestones-list', params.role, params.nurseryId, childIds],
    queryFn: async (): Promise<MilestoneItem[]> => {
      let q = supabase.from('milestones').select('*').order('achieved_at', { ascending: false }).order('created_at', { ascending: false });
      // A family and a teacher read their children's (the rules also keep each to those); an admin, the nursery's.
      if (params.role === 'admin') {
        if (!params.nurseryId) return [];
        q = q.eq('nursery_id', params.nurseryId);
      } else {
        if (!childIds.length) return [];
        q = q.in('child_id', childIds);
      }
      const res = await q;
      if (res.error) throw res.error;
      return (res.data ?? []) as MilestoneItem[];
    },
    enabled: params.role === 'admin' ? Boolean(params.nurseryId) : childrenQuery.isFetched,
  });

  // Each milestone with its child's name in the language on screen.
  const { i18n } = useTranslation();
  const ar = i18n.language === 'ar';
  const milestones = useMemo(() => {
    const names = new Map((childrenQuery.data ?? []).map((c) => [c.id, (ar ? c.full_name_ar : c.full_name_en) || c.full_name_en || c.full_name_ar]));
    return (listQuery.data ?? []).map((m) => ({ ...m, childName: names.get(m.child_id) }));
  }, [listQuery.data, childrenQuery.data, ar]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['milestones-list'] });
  const upsertMilestone = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: MilestoneDraft }) => saveMilestone(id, draft),
    onSuccess: refresh,
  });
  const deleteMilestone = useMutation({ mutationFn: removeMilestone, onSuccess: refresh });

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
    milestones,
    childAgeMap,
    isLoading: childrenQuery.isLoading || listQuery.isLoading,
    isError: childrenQuery.isError || listQuery.isError,
    retry: () => void Promise.all([childrenQuery.refetch(), listQuery.refetch()]),
    saveMilestone: upsertMilestone.mutateAsync,
    deleteMilestone: deleteMilestone.mutateAsync,
  };
}
