import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const adminCoursesListQueryKey = (nurseryId: string | null | undefined) =>
  ['admin-courses-list', nurseryId] as const;

export type CourseCategory = 'sport' | 'art' | 'music' | 'academic' | 'language' | 'other';
export type CourseStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type AdminCoursesListRow = {
  id: string;
  title_ar: string;
  title_en: string;
  category: CourseCategory;
  price_per_month: number;
  max_students: number | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CourseStatus;
  teacher_user_id: string | null;
  teacher_name_en: string | null;
  teacher_name_ar: string | null;
  enrollment_count: number;
};

export function useAdminCoursesList(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminCoursesListQueryKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<AdminCoursesListRow[]> => {
      if (!nurseryId) return [];

      const { data: courses, error } = await supabase
        .from('courses')
        .select('id, title_ar, title_en, category, price_per_month, max_students, starts_on, ends_on, status, teacher_user_id')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!courses || courses.length === 0) return [];

      const teacherIds = [...new Set(courses.map((c) => c.teacher_user_id).filter(Boolean))] as string[];
      const [teachersRes, enrollmentsRes] = await Promise.all([
        teacherIds.length
          ? supabase.from('users').select('id, name_ar, name_en').in('id', teacherIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('course_enrollments')
          .select('course_id')
          .in('course_id', courses.map((c) => c.id))
          .eq('status', 'active'),
      ]);

      const teacherMap = new Map(
        (teachersRes.data ?? []).map((u) => [u.id, u]),
      );
      const countMap = new Map<string, number>();
      for (const e of enrollmentsRes.data ?? []) {
        countMap.set(e.course_id, (countMap.get(e.course_id) ?? 0) + 1);
      }

      return courses.map((c) => {
        const teacher = c.teacher_user_id ? teacherMap.get(c.teacher_user_id) : null;
        return {
          ...c,
          teacher_name_en: teacher?.name_en ?? null,
          teacher_name_ar: teacher?.name_ar ?? null,
          enrollment_count: countMap.get(c.id) ?? 0,
        } as AdminCoursesListRow;
      });
    },
    enabled: Boolean(nurseryId),
  });

  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`admin-courses-list-${nurseryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_enrollments' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [nurseryId, queryClient, key]);

  return query;
}
