import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { templateNotificationRow } from '@/lib/notificationText';
import { supabase } from '@/lib/supabase';
import type { DailyReportFormData, DailyReportStatus } from '@/hooks/dailyReportsSchema';

function dailyReportNotification(nurseryId: string | undefined, parentId: string) {
  return templateNotificationRow({
    nurseryId: nurseryId ?? null,
    userId: parentId,
    type: 'daily_report_published',
    actionLink: '/parent/daily-reports',
    channel: 'push',
  });
}

export function useDailyReports(params: { userId?: string; nurseryId?: string }) {
  const qc = useQueryClient();

  const classesQuery = useQuery({
    queryKey: ['teacher-report-classes', params.userId, params.nurseryId],
    queryFn: async () => {
      if (!params.userId || !params.nurseryId) return [];
      // Pull every class the teacher belongs to via class_staff
      // (covers both lead and assistant roles).
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
    },
    enabled: Boolean(params.userId && params.nurseryId),
  });

  const childrenQuery = useQuery({
    queryKey: ['teacher-report-children', classesQuery.data],
    queryFn: async () => {
      const classIds = (classesQuery.data ?? []).map((c) => c.id);
      if (!classIds.length) return [];
      const res = await supabase
        .from('children')
        .select('id, class_id, full_name_ar, full_name_en, dob')
        .in('class_id', classIds)
        .eq('status', 'active');
      if (res.error) throw res.error;
      return (res.data ?? []) as { id: string; class_id: string | null; full_name_ar: string; full_name_en: string; dob: string }[];
    },
    enabled: Boolean(classesQuery.data?.length),
  });

  const reportsListQuery = useQuery({
    queryKey: ['teacher-daily-reports-list', params.userId, params.nurseryId],
    queryFn: async () => {
      if (!params.userId || !params.nurseryId) return [];
      const res = await supabase
        .from('daily_reports')
        .select('id, child_id, report_date, status, mood_json, meals_json, nap_json, created_at')
        .eq('teacher_id', params.userId)
        .eq('nursery_id', params.nurseryId)
        .order('report_date', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Array<Record<string, unknown>>;
    },
    enabled: Boolean(params.userId && params.nurseryId),
  });

  const upsertReport = useMutation({
    mutationFn: async (args: { form: DailyReportFormData; status: DailyReportStatus }) => {
      if (!params.userId || !params.nurseryId) throw new Error('Missing user/nursery');
      const durationMin = args.form.nap.napped ? args.form.nap.durationMinutes ?? 0 : 0;
      const payload = {
        nursery_id: params.nurseryId,
        child_id: args.form.childId,
        teacher_id: params.userId,
        report_date: args.form.reportDate,
        status: args.status,
        meals_json: {
          breakfast: args.form.meals.breakfast,
          lunch: args.form.meals.lunch,
          snacks: args.form.meals.snacks,
        },
        nap_json: {
          napped: args.form.nap.napped,
          duration_minutes: durationMin,
          quality: args.form.nap.napped ? args.form.nap.quality : null,
          notes: args.form.nap.notes || null,
        },
        mood_json: {
          mood: args.form.mood.mood,
          notes: args.form.mood.notes || null,
        },
        toilet_json: {
          change_count: args.form.toilet.changeCount,
          diaper_changes: args.form.toilet.changeCount,
          notes: args.form.toilet.notes || null,
        },
        activities_json: {
          tags: args.form.activities.tags,
          free_text: args.form.activities.freeText || null,
          participated_in: args.form.activities.tags,
          notes: args.form.activities.notes || null,
        },
        feeding_json: {
          bottle_sessions: args.form.feeding.bottleSessions,
          bottle_feeds_count: args.form.feeding.bottleSessions.length,
          bottle_amount_ml:
            args.form.feeding.bottleSessions.length > 0
              ? Math.round(
                  args.form.feeding.bottleSessions.reduce((a, s) => a + s.amountMl, 0) /
                    args.form.feeding.bottleSessions.length,
                )
              : 0,
          nursing_count: args.form.feeding.nursingCount,
          nursing_duration_minutes: args.form.feeding.nursingDurationMinutes,
          solid_foods: args.form.feeding.solidFoods,
          notes: args.form.feeding.notes || null,
        },
        special_notes: args.form.specialNotes || null,
        published_at: args.status === 'published' ? new Date().toISOString() : null,
      };

      const upsertRes = await supabase
        .from('daily_reports')
        .upsert(payload as never, { onConflict: 'child_id,report_date' })
        .select('id')
        .single();
      if (upsertRes.error) throw upsertRes.error;

      if (args.status === 'published') {
        const parentsRes = await supabase.from('parent_children').select('parent_id').eq('child_id', args.form.childId);
        if (!parentsRes.error) {
          const notifications = ((parentsRes.data ?? []) as { parent_id: string }[]).map((p) =>
            dailyReportNotification(params.nurseryId, p.parent_id),
          );
          if (notifications.length) await supabase.from('notifications').insert(notifications as never);
        }
      }

      return (upsertRes.data as { id: string }).id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['teacher-daily-reports-list'] });
    },
  });

  const deleteDraftReport = useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.from('daily_reports').delete().eq('id', id).eq('status', 'draft');
      if (res.error) throw res.error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['teacher-daily-reports-list'] }),
  });

  const publishDraftById = useMutation({
    mutationFn: async (args: { id: string; childId: string }) => {
      if (!params.nurseryId) throw new Error('Missing nursery');
      const res = await supabase
        .from('daily_reports')
        .update({ status: 'published', published_at: new Date().toISOString() } as never)
        .eq('id', args.id)
        .eq('status', 'draft');
      if (res.error) throw res.error;

      const parentsRes = await supabase.from('parent_children').select('parent_id').eq('child_id', args.childId);
      if (!parentsRes.error) {
        const notifications = ((parentsRes.data ?? []) as { parent_id: string }[]).map((p) =>
          dailyReportNotification(params.nurseryId, p.parent_id),
        );
        if (notifications.length) await supabase.from('notifications').insert(notifications as never);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['teacher-daily-reports-list'] }),
  });

  const childNameMap = useMemo(
    () => new Map((childrenQuery.data ?? []).map((c) => [c.id, c.full_name_ar || c.full_name_en])),
    [childrenQuery.data],
  );

  const reactionsMetaQuery = useQuery({
    queryKey: ['teacher-daily-reports-reactions-meta', reportsListQuery.data],
    queryFn: async () => {
      const reportIds = ((reportsListQuery.data ?? []) as Array<Record<string, unknown>>).map((r) => String(r.id));
      if (!reportIds.length) return { counts: new Map<string, number>(), latestComment: new Map<string, string>() };
      const res = await supabase
        .from('report_reactions')
        .select('report_id, comment, created_at')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false });
      if (res.error) throw res.error;
      const counts = new Map<string, number>();
      const latestComment = new Map<string, string>();
      ((res.data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
        const id = String(row.report_id ?? '');
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (!latestComment.has(id) && row.comment) latestComment.set(id, String(row.comment));
      });
      return { counts, latestComment };
    },
    enabled: Boolean(reportsListQuery.data?.length),
  });

  return {
    classes: classesQuery.data ?? [],
    children: childrenQuery.data ?? [],
    childNameMap,
    list: reportsListQuery.data ?? [],
    isLoadingList: reportsListQuery.isLoading,
    reactionsCountMap: reactionsMetaQuery.data?.counts ?? new Map<string, number>(),
    latestReactionCommentMap: reactionsMetaQuery.data?.latestComment ?? new Map<string, string>(),
    upsertReport: upsertReport.mutateAsync,
    isSaving: upsertReport.isPending,
    deleteDraftReport: deleteDraftReport.mutateAsync,
    publishDraftById: publishDraftById.mutateAsync,
  };
}
