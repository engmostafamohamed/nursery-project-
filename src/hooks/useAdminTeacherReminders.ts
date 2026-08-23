import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const teacherRemindersKey = (nurseryId: string | null | undefined) =>
  ['admin-teacher-reminders', nurseryId] as const;

export type TeacherReminderTemplate = {
  id: string;
  nursery_id: string;
  teacher_id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  active: boolean;
  created_at: string;
};

export type NurseryTeacher = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
};

export type TeacherReminderInput = {
  teacher_id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  active: boolean;
};

export function useNurseryTeachers(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['nursery-teachers', nurseryId],
    queryFn: async (): Promise<NurseryTeacher[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('users')
        .select('id, name_ar, name_en')
        .eq('nursery_id', nurseryId)
        .eq('role', 'teacher')
        .order('name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as NurseryTeacher[];
    },
    enabled: Boolean(nurseryId),
  });
}

export function useAdminTeacherReminders(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = teacherRemindersKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TeacherReminderTemplate[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('teacher_monthly_reminder_templates')
        .select('id, nursery_id, teacher_id, title_ar, title_en, body_ar, body_en, active, created_at')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeacherReminderTemplate[];
    },
    enabled: Boolean(nurseryId),
  });

  const create = useMutation({
    mutationFn: async (input: TeacherReminderInput) => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { error } = await supabase
        .from('teacher_monthly_reminder_templates')
        .insert({ ...input, nursery_id: nurseryId } as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TeacherReminderInput }) => {
      const { error } = await supabase
        .from('teacher_monthly_reminder_templates')
        .update(input as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('teacher_monthly_reminder_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`admin-teacher-reminders-${nurseryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_monthly_reminder_templates' },
        () => void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, queryClient, key]);

  return { query, create, update, remove };
}
