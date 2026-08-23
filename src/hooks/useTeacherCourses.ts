import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type TeacherCourseRow = {
  id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  category: string;
  price_per_month: number;
  schedule_days: string[] | null;
  schedule_time_start: string | null;
  schedule_time_end: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  enrollment_count: number;
};

export type TeacherCourseEnrolleeRow = {
  id: string;
  child_id: string;
  child_name_en: string;
  child_name_ar: string;
  status: string;
  enrolled_at: string;
};

export function useTeacherCourses(userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ['teacher-courses', userId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TeacherCourseRow[]> => {
      if (!userId) return [];

      const { data: courses, error } = await supabase
        .from('courses')
        .select('id, title_ar, title_en, description_ar, description_en, category, price_per_month, schedule_days, schedule_time_start, schedule_time_end, starts_on, ends_on, status')
        .eq('teacher_user_id', userId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!courses || courses.length === 0) return [];

      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .in('course_id', courses.map((c) => c.id))
        .eq('status', 'active');

      const countMap = new Map<string, number>();
      for (const e of enrollments ?? []) {
        countMap.set(e.course_id, (countMap.get(e.course_id) ?? 0) + 1);
      }

      return courses.map((c) => ({
        ...c,
        enrollment_count: countMap.get(c.id) ?? 0,
      })) as TeacherCourseRow[];
    },
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`teacher-courses-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `teacher_user_id=eq.${userId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, queryClient, key]);

  return query;
}

export function useTeacherCourseEnrollees(courseId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = ['teacher-course-enrollees', courseId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TeacherCourseEnrolleeRow[]> => {
      if (!courseId) return [];

      const { data: enrollments, error } = await supabase
        .from('course_enrollments')
        .select('id, child_id, status, enrolled_at')
        .eq('course_id', courseId)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: true });
      if (error) throw error;
      if (!enrollments || enrollments.length === 0) return [];

      const childIds = enrollments.map((e) => e.child_id);
      const { data: children } = await supabase
        .from('children')
        .select('id, full_name_en, full_name_ar')
        .in('id', childIds);

      const childMap = new Map((children ?? []).map((c) => [c.id, c]));

      return enrollments.map((e) => {
        const child = childMap.get(e.child_id);
        return {
          ...e,
          child_name_en: child?.full_name_en ?? '',
          child_name_ar: child?.full_name_ar ?? '',
        } as TeacherCourseEnrolleeRow;
      });
    },
    enabled: Boolean(courseId),
  });

  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`teacher-course-enrollees-${courseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_enrollments', filter: `course_id=eq.${courseId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [courseId, queryClient, key]);

  return query;
}
