import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { awardReviewPoints } from '@/lib/loyaltyPoints';

export type ParentReportItem = {
  id: string;
  childId: string;
  childName: string;
  reportDate: string;
  status: 'draft' | 'published';
  meals: Record<string, unknown>;
  nap: Record<string, unknown>;
  mood: Record<string, unknown>;
  toilet: Record<string, unknown>;
  activities: Record<string, unknown>;
  feeding: Record<string, unknown>;
  specialNotes: string | null;
  teacherName: string;
  publishedAt: string | null;
};

export type ParentReaction = {
  id: string;
  report_id: string;
  parent_id: string;
  reaction: string | null;
  comment: string | null;
  created_at: string;
};

export function useParentReports(params: {
  parentId?: string;
  nurseryId?: string;
  childId?: string;
  fromDate?: string;
  toDate?: string;
  sort?: 'newest' | 'oldest';
}) {
  const qc = useQueryClient();
  const reportsQuery = useQuery({
    queryKey: ['parent-daily-reports', params],
    queryFn: async (): Promise<{ reports: ParentReportItem[]; children: { id: string; name: string }[] }> => {
      if (!params.parentId || !params.nurseryId) return { reports: [], children: [] };
      const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', params.parentId);
      if (linksRes.error) throw linksRes.error;
      const childIds = ((linksRes.data ?? []) as { child_id: string }[]).map((l) => l.child_id);
      if (!childIds.length) return { reports: [], children: [] };

      const childRes = await supabase.from('children').select('id, full_name_ar, full_name_en').in('id', childIds);
      if (childRes.error) throw childRes.error;
      const childRows = (childRes.data ?? []) as { id: string; full_name_ar: string; full_name_en: string }[];
      const childMap = new Map(childRows.map((c) => [c.id, c.full_name_ar || c.full_name_en]));

      let q = supabase
        .from('daily_reports')
        .select('id, child_id, report_date, status, meals_json, nap_json, mood_json, toilet_json, activities_json, feeding_json, special_notes, teacher_id, published_at')
        .eq('nursery_id', params.nurseryId)
        .eq('status', 'published')
        .in('child_id', childIds);
      if (params.childId) q = q.eq('child_id', params.childId);
      if (params.fromDate) q = q.gte('report_date', params.fromDate);
      if (params.toDate) q = q.lte('report_date', params.toDate);
      q = q.order('report_date', { ascending: params.sort === 'oldest' });
      const reportRes = await q;
      if (reportRes.error) throw reportRes.error;
      const reportRows = (reportRes.data ?? []) as Array<Record<string, unknown>>;

      const teacherIds = [...new Set(reportRows.map((r) => String(r.teacher_id ?? '')).filter(Boolean))];
      const teachersRes = teacherIds.length
        ? await supabase.from('users').select('id, name_ar, name_en').in('id', teacherIds)
        : { data: [], error: null };
      if (teachersRes.error) throw teachersRes.error;
      const teacherMap = new Map(
        ((teachersRes.data ?? []) as Array<Record<string, unknown>>).map((u) => [
          String(u.id),
          String(u.name_ar ?? u.name_en ?? 'Teacher'),
        ]),
      );

      const reports = reportRows.map((r) => ({
        id: String(r.id),
        childId: String(r.child_id),
        childName: childMap.get(String(r.child_id)) ?? 'Child',
        reportDate: String(r.report_date),
        status: String(r.status) as 'draft' | 'published',
        meals: (r.meals_json as Record<string, unknown>) ?? {},
        nap: (r.nap_json as Record<string, unknown>) ?? {},
        mood: (r.mood_json as Record<string, unknown>) ?? {},
        toilet: (r.toilet_json as Record<string, unknown>) ?? {},
        activities: (r.activities_json as Record<string, unknown>) ?? {},
        feeding: (r.feeding_json as Record<string, unknown>) ?? {},
        specialNotes: (r.special_notes as string | null) ?? null,
        teacherName: teacherMap.get(String(r.teacher_id ?? '')) ?? 'Teacher',
        publishedAt: (r.published_at as string | null) ?? null,
      }));

      return {
        reports,
        children: childRows.map((c) => ({ id: c.id, name: c.full_name_ar || c.full_name_en })),
      };
    },
    enabled: Boolean(params.parentId && params.nurseryId),
  });

  const reactionsQuery = useQuery({
    queryKey: ['parent-report-reactions', params.parentId],
    queryFn: async (): Promise<ParentReaction[]> => {
      if (!params.parentId) return [];
      const res = await supabase
        .from('report_reactions')
        .select('id, report_id, parent_id, reaction, comment, created_at')
        .eq('parent_id', params.parentId)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as ParentReaction[];
    },
    enabled: Boolean(params.parentId),
  });

  const reactMutation = useMutation({
    mutationFn: async (args: { reportId: string; reaction?: string; comment?: string }) => {
      if (!params.parentId || !params.nurseryId) throw new Error('Missing parent');
      const existing = (reactionsQuery.data ?? []).find((r) => r.report_id === args.reportId);
      if (existing) {
        const res = await supabase
          .from('report_reactions')
          .update({ reaction: args.reaction ?? null, comment: args.comment ?? null } as never)
          .eq('id', existing.id);
        if (res.error) throw res.error;
        return;
      }
      const res = await supabase.from('report_reactions').insert({
        report_id: args.reportId,
        parent_id: params.parentId,
        reaction: args.reaction ?? null,
        comment: args.comment ?? null,
      } as never);
      if (res.error) throw res.error;
      await awardReviewPoints({
        nurseryId: params.nurseryId,
        parentId: params.parentId,
        referenceId: args.reportId,
        hasText: Boolean(args.comment?.trim()),
        hasReaction: Boolean(args.reaction),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['parent-report-reactions'] }),
  });

  const stats = useMemo(() => {
    const reports = reportsQuery.data?.reports ?? [];
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);
    const thisWeek = reports.filter((r) => new Date(r.reportDate) >= weekAgo).length;
    const thisMonth = reports.filter((r) => new Date(r.reportDate).getMonth() === now.getMonth()).length;
    const lastReportDate = reports.length ? reports[0].reportDate : null;
    const todayReports = reports.filter((r) => r.reportDate === now.toISOString().slice(0, 10));
    return { thisWeek, thisMonth, lastReportDate, todayReports };
  }, [reportsQuery.data]);

  const unreadBadge = useQuery({
    queryKey: ['parent-reports-badge', params.parentId],
    queryFn: async () => {
      if (!params.parentId) return 0;
      const res = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', params.parentId)
        .eq('type', 'daily_report_published')
        .eq('read', false);
      if (res.error) throw res.error;
      return res.count ?? 0;
    },
    enabled: Boolean(params.parentId),
  });

  return {
    reports: reportsQuery.data?.reports ?? [],
    children: reportsQuery.data?.children ?? [],
    reactions: reactionsQuery.data ?? [],
    isLoading: reportsQuery.isLoading || reactionsQuery.isLoading,
    stats,
    unreadCount: unreadBadge.data ?? 0,
    saveReaction: reactMutation.mutateAsync,
  };
}
