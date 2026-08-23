import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export const adminCourseDetailQueryKey = (courseId: string | null | undefined) =>
  ['admin-course-detail', courseId] as const;

export const adminCourseEnrollmentsQueryKey = (courseId: string | null | undefined) =>
  ['admin-course-enrollments', courseId] as const;

export const adminCourseInvoicesQueryKey = (courseId: string | null | undefined) =>
  ['admin-course-invoices', courseId] as const;

export type CourseDetailRow = {
  id: string;
  nursery_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  category: string;
  price_per_month: number;
  max_students: number | null;
  schedule_days: string[] | null;
  schedule_time_start: string | null;
  schedule_time_end: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  teacher_user_id: string | null;
  teacher_name_en: string | null;
  teacher_name_ar: string | null;
};

export type CourseEnrollmentRow = {
  id: string;
  course_id: string;
  child_id: string;
  status: string;
  enrolled_at: string;
  unenrolled_at: string | null;
  child_name_en: string;
  child_name_ar: string;
  parent_id: string | null;
  parent_name_en: string | null;
  parent_name_ar: string | null;
};

export type CourseInvoiceRow = {
  id: string;
  course_id: string;
  enrollment_id: string;
  child_id: string;
  billing_month: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  invoice_number: string | null;
  notes: string | null;
  child_name_en: string;
  child_name_ar: string;
};

export function useAdminCourseDetail(courseId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminCourseDetailQueryKey(courseId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<CourseDetailRow | null> => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      let teacher: { name_en: string | null; name_ar: string | null } | null = null;
      if (data.teacher_user_id) {
        const { data: u } = await supabase
          .from('users')
          .select('name_en, name_ar')
          .eq('id', data.teacher_user_id)
          .maybeSingle();
        teacher = u ?? null;
      }

      return {
        ...data,
        teacher_name_en: teacher?.name_en ?? null,
        teacher_name_ar: teacher?.name_ar ?? null,
      } as CourseDetailRow;
    },
    enabled: Boolean(courseId),
  });

  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`admin-course-detail-${courseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `id=eq.${courseId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [courseId, queryClient, key]);

  return query;
}

export function useAdminCourseEnrollments(courseId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminCourseEnrollmentsQueryKey(courseId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<CourseEnrollmentRow[]> => {
      if (!courseId) return [];

      const { data: enrollments, error } = await supabase
        .from('course_enrollments')
        .select('id, course_id, child_id, status, enrolled_at, unenrolled_at')
        .eq('course_id', courseId)
        .order('enrolled_at', { ascending: false });
      if (error) throw error;
      if (!enrollments || enrollments.length === 0) return [];

      const childIds = enrollments.map((e) => e.child_id);
      const { data: children } = await supabase
        .from('children')
        .select('id, full_name_en, full_name_ar')
        .in('id', childIds);

      const { data: parentLinks } = await supabase
        .from('parent_children')
        .select('child_id, parent_id')
        .in('child_id', childIds);

      const parentIds = [...new Set((parentLinks ?? []).map((p) => p.parent_id))];
      const { data: parents } = parentIds.length
        ? await supabase.from('users').select('id, name_en, name_ar').in('id', parentIds)
        : Promise.resolve({ data: [], error: null });

      const childMap = new Map((children ?? []).map((c) => [c.id, c]));
      const parentLinkMap = new Map((parentLinks ?? []).map((p) => [p.child_id, p.parent_id]));
      const parentMap = new Map((parents ?? []).map((p) => [p.id, p]));

      return enrollments.map((e) => {
        const child = childMap.get(e.child_id);
        const parentId = parentLinkMap.get(e.child_id) ?? null;
        const parent = parentId ? parentMap.get(parentId) : null;
        return {
          ...e,
          child_name_en: child?.full_name_en ?? '',
          child_name_ar: child?.full_name_ar ?? '',
          parent_id: parentId,
          parent_name_en: parent?.name_en ?? null,
          parent_name_ar: parent?.name_ar ?? null,
        } as CourseEnrollmentRow;
      });
    },
    enabled: Boolean(courseId),
  });

  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`admin-course-enrollments-${courseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_enrollments', filter: `course_id=eq.${courseId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [courseId, queryClient, key]);

  return query;
}

export function useAdminCourseInvoices(courseId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminCourseInvoicesQueryKey(courseId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<CourseInvoiceRow[]> => {
      if (!courseId) return [];

      const { data: invoices, error } = await supabase
        .from('course_invoices')
        .select('id, course_id, enrollment_id, child_id, billing_month, amount, currency, status, due_date, paid_at, invoice_number, notes')
        .eq('course_id', courseId)
        .order('billing_month', { ascending: false });
      if (error) throw error;
      if (!invoices || invoices.length === 0) return [];

      const childIds = [...new Set(invoices.map((i) => i.child_id))];
      const { data: children } = await supabase
        .from('children')
        .select('id, full_name_en, full_name_ar')
        .in('id', childIds);

      const childMap = new Map((children ?? []).map((c) => [c.id, c]));

      return invoices.map((inv) => {
        const child = childMap.get(inv.child_id);
        return {
          ...inv,
          child_name_en: child?.full_name_en ?? '',
          child_name_ar: child?.full_name_ar ?? '',
        } as CourseInvoiceRow;
      });
    },
    enabled: Boolean(courseId),
  });

  useEffect(() => {
    if (!courseId) return;
    const channel = supabase
      .channel(`admin-course-invoices-${courseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_invoices', filter: `course_id=eq.${courseId}` }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [courseId, queryClient, key]);

  return query;
}
