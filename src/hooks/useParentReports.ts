import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cardFromRow, type DailyReportCard } from '@/lib/dailyReportCard';
import { supabase } from '@/lib/supabase';
import { awardReviewPoints } from '@/lib/loyaltyPoints';

/** A sent report as the family reads it (see DailyReportCard); always has an id. */
export type ParentReportItem = DailyReportCard & { id: string };

/** The notifications a sent report creates for the family (send_daily_reports). */
export const DAILY_REPORT_NOTIFICATION_TYPE = 'daily_report';

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

      // Through get_parent_daily_reports: each report with the child's code and class of that day and
      // who sent it, and never a copy the service worker kept from before.
      const reportRes = await supabase.rpc('get_parent_daily_reports' as never, {
        p_child_id: params.childId || null,
        p_from: params.fromDate || null,
        p_to: params.toDate || null,
        p_limit: 500,
      } as never);
      if (reportRes.error) throw reportRes.error;
      const newestFirst = ((reportRes.data ?? []) as Array<Record<string, unknown>>)
        .map(cardFromRow)
        .filter((card): card is ParentReportItem => Boolean(card.id));

      return {
        reports: params.sort === 'oldest' ? [...newestFirst].reverse() : newestFirst,
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
        .eq('type', DAILY_REPORT_NOTIFICATION_TYPE)
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
