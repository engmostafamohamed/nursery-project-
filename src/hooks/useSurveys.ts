import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { FormQuestion, SurveyResponseRow, SurveyRow, SurveyStatus, SurveyType } from '@/types/survey';

export type { FormQuestion, SurveyRow, SurveyResponseRow, SurveyType, SurveyStatus };

export function useSurveys(params: { nurseryId?: string; parentId?: string }) {
  const qc = useQueryClient();

  const surveysQuery = useQuery({
    queryKey: ['surveys', params.nurseryId],
    queryFn: async () => {
      if (!params.nurseryId) return [] as SurveyRow[];
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .eq('nursery_id', params.nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SurveyRow[];
    },
    enabled: Boolean(params.nurseryId),
  });

  const parentResponsesQuery = useQuery({
    queryKey: ['survey-responses-parent', params.parentId],
    queryFn: async () => {
      if (!params.parentId) return [] as SurveyResponseRow[];
      const { data, error } = await supabase
        .from('survey_responses')
        .select('*')
        .eq('user_id', params.parentId);
      if (error) throw error;
      return (data ?? []) as SurveyResponseRow[];
    },
    enabled: Boolean(params.parentId),
  });

  const responsesQuery = useQuery({
    queryKey: ['survey-responses-all', params.nurseryId],
    queryFn: async () => {
      if (!params.nurseryId) return [] as SurveyResponseRow[];
      const surveyIds = (surveysQuery.data ?? []).map((s) => s.id);
      if (!surveyIds.length) return [];
      const { data, error } = await supabase
        .from('survey_responses')
        .select('*')
        .in('survey_id', surveyIds);
      if (error) throw error;
      return (data ?? []) as SurveyResponseRow[];
    },
    enabled: Boolean(params.nurseryId) && Boolean(surveysQuery.data?.length),
  });

  const createSurvey = useMutation({
    mutationFn: async (payload: {
      nurseryId: string;
      title: string;
      type: SurveyType;
      questions: FormQuestion[];
      deadline?: string | null;
      targetClassIds?: string[] | null;
    }) => {
      const { data, error } = await supabase
        .from('surveys')
        .insert({
          nursery_id: payload.nurseryId,
          title: payload.title,
          title_ar: payload.title,
          title_en: payload.title,
          target_role: 'parent',
          type: payload.type,
          deadline: payload.deadline ?? null,
          questions_json: payload.questions,
          status: 'active',
        } as never)
        .select('id')
        .single();
      if (error) throw error;

      const surveyId = (data as { id: string }).id;
      const parentIds = await resolveParentIds(payload.nurseryId, payload.targetClassIds ?? null);
      if (!parentIds.length) return;

      const isPermission = payload.type === 'permission';
      const deadlineLabel = payload.deadline ? new Date(payload.deadline).toLocaleString() : '';
      await supabase.from('notifications').insert(
        parentIds.map((id) => ({
          nursery_id: payload.nurseryId,
          user_id: id,
          type: isPermission ? 'permission_request' : 'survey_new',
          urgency: isPermission ? 'high' : 'normal',
          title_ar: isPermission ? 'مطلوب إذن من ولي الأمر' : 'استبيان جديد',
          title_en: isPermission ? 'Permission required' : 'New survey',
          body_ar: deadlineLabel
            ? `${payload.title} — الموعد النهائي ${deadlineLabel}`
            : payload.title,
          body_en: deadlineLabel
            ? `${payload.title} — deadline ${deadlineLabel}`
            : payload.title,
          channel: 'in_app',
          read: false,
          action_link: '/parent/surveys',
          sent_at: new Date().toISOString(),
        })) as never,
      );

      void surveyId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });

  const updateSurvey = useMutation({
    mutationFn: async (payload: {
      id: string;
      updates: Partial<SurveyRow> & Record<string, unknown>;
      surveyType?: SurveyType;
      title?: string;
      deadline?: string | null;
      nurseryId?: string;
      targetClassIds?: string[] | null;
    }) => {
      const { error } = await supabase
        .from('surveys')
        .update(payload.updates as never)
        .eq('id', payload.id);
      if (error) throw error;

      const activating = payload.updates?.status === 'active';
      if (!activating || !payload.nurseryId) return;

      const parentIds = await resolveParentIds(
        payload.nurseryId,
        payload.targetClassIds ?? null,
      );
      if (!parentIds.length) return;

      const title = payload.title ?? 'New form';
      const isPermission = payload.surveyType === 'permission';
      const deadlineLabel = payload.deadline ? new Date(payload.deadline).toLocaleString() : '';
      await supabase.from('notifications').insert(
        parentIds.map((id) => ({
          nursery_id: payload.nurseryId,
          user_id: id,
          type: isPermission ? 'permission_request' : 'survey_new',
          urgency: isPermission ? 'high' : 'normal',
          title_ar: isPermission ? 'مطلوب إذن من ولي الأمر' : 'استبيان جديد',
          title_en: isPermission ? 'Permission required' : 'New survey',
          body_ar: deadlineLabel ? `${title} — الموعد النهائي ${deadlineLabel}` : title,
          body_en: deadlineLabel ? `${title} — deadline ${deadlineLabel}` : title,
          channel: 'in_app',
          read: false,
          action_link: '/parent/surveys',
          sent_at: new Date().toISOString(),
        })) as never,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });

  const submitResponse = useMutation({
    mutationFn: async (payload: {
      surveyId: string;
      userId: string;
      answers: Record<string, unknown>;
    }) => {
      const { data: existing } = await supabase
        .from('survey_responses')
        .select('id')
        .eq('survey_id', payload.surveyId)
        .eq('user_id', payload.userId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('survey_responses')
          .update({ answers_json: payload.answers } as never)
          .eq('id', (existing as { id: string }).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('survey_responses').insert({
          survey_id: payload.surveyId,
          user_id: payload.userId,
          answers_json: payload.answers,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-responses-parent'] }),
  });

  const deleteSurvey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('surveys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });

  const responseCounts = useMemo(() => {
    const map = new Map<string, number>();
    (responsesQuery.data ?? []).forEach((r) => {
      map.set(r.survey_id, (map.get(r.survey_id) ?? 0) + 1);
    });
    return map;
  }, [responsesQuery.data]);

  const parentPendingSurveys = useMemo(() => {
    const responded = new Set(
      (parentResponsesQuery.data ?? []).map((r) => r.survey_id),
    );
    return (surveysQuery.data ?? []).filter(
      (s) =>
        (s.status === 'active' || s.status === 'published') &&
        !responded.has(s.id),
    );
  }, [surveysQuery.data, parentResponsesQuery.data]);

  return {
    surveys: surveysQuery.data ?? [],
    parentResponses: parentResponsesQuery.data ?? [],
    allResponses: responsesQuery.data ?? [],
    responseCounts,
    parentPendingSurveys,
    isLoading: surveysQuery.isLoading,
    createSurvey: createSurvey.mutateAsync,
    updateSurvey: updateSurvey.mutateAsync,
    submitResponse: submitResponse.mutateAsync,
    deleteSurvey: deleteSurvey.mutateAsync,
  };
}

async function resolveParentIds(
  nurseryId: string,
  targetClassIds: string[] | null,
): Promise<string[]> {
  if (targetClassIds?.length) {
    const { data } = await supabase
      .from('parent_children')
      .select('parent_id, children!inner(class_id)')
      .in('children.class_id', targetClassIds);
    return Array.from(
      new Set(((data ?? []) as { parent_id: string }[]).map((r) => r.parent_id)),
    );
  }
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('nursery_id', nurseryId)
    .eq('role', 'parent');
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}
