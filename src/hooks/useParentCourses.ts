import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ParentCourseRow = {
  enrollment_id: string;
  course_id: string;
  child_id: string;
  child_name_en: string;
  child_name_ar: string;
  course_title_en: string;
  course_title_ar: string;
  category: string;
  price_per_month: number;
  schedule_days: string[] | null;
  schedule_time_start: string | null;
  schedule_time_end: string | null;
  status: string;
  teacher_name_en: string | null;
  teacher_name_ar: string | null;
};

export type ParentCourseInvoiceRow = {
  id: string;
  course_id: string;
  course_title_en: string;
  course_title_ar: string;
  child_id: string;
  child_name_en: string;
  child_name_ar: string;
  billing_month: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  invoice_number: string | null;
};

export function useParentCourses(parentUserId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ['parent-courses', parentUserId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<{ enrollments: ParentCourseRow[]; invoices: ParentCourseInvoiceRow[] }> => {
      if (!parentUserId) return { enrollments: [], invoices: [] };

      const { data: links } = await supabase
        .from('parent_children')
        .select('child_id')
        .eq('parent_id', parentUserId);

      const childIds = (links ?? []).map((l) => l.child_id);
      if (childIds.length === 0) return { enrollments: [], invoices: [] };

      const { data: children } = await supabase
        .from('children')
        .select('id, full_name_en, full_name_ar')
        .in('id', childIds);

      const { data: enrollments, error: enrollErr } = await supabase
        .from('course_enrollments')
        .select('id, course_id, child_id, status')
        .in('child_id', childIds)
        .eq('status', 'active');
      if (enrollErr) throw enrollErr;
      if (!enrollments || enrollments.length === 0) return { enrollments: [], invoices: [] };

      const courseIds = [...new Set(enrollments.map((e) => e.course_id))];
      const { data: courses } = await supabase
        .from('courses')
        .select('id, title_en, title_ar, category, price_per_month, schedule_days, schedule_time_start, schedule_time_end, status, teacher_user_id')
        .in('id', courseIds);

      const teacherIds = [...new Set((courses ?? []).map((c) => c.teacher_user_id).filter(Boolean))] as string[];
      const [teachersRes, invoicesRes] = await Promise.all([
        teacherIds.length
          ? supabase.from('users').select('id, name_en, name_ar').in('id', teacherIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('course_invoices')
          .select('id, course_id, enrollment_id, child_id, billing_month, amount, currency, status, due_date, paid_at, invoice_number')
          .in('child_id', childIds)
          .order('billing_month', { ascending: false }),
      ]);

      const childMap = new Map((children ?? []).map((c) => [c.id, c]));
      const courseMap = new Map((courses ?? []).map((c) => [c.id, c]));
      const teacherMap = new Map((teachersRes.data ?? []).map((u) => [u.id, u]));

      const enrollmentRows: ParentCourseRow[] = enrollments.map((e) => {
        const child = childMap.get(e.child_id);
        const course = courseMap.get(e.course_id);
        const teacher = course?.teacher_user_id ? teacherMap.get(course.teacher_user_id) : null;
        return {
          enrollment_id: e.id,
          course_id: e.course_id,
          child_id: e.child_id,
          child_name_en: child?.full_name_en ?? '',
          child_name_ar: child?.full_name_ar ?? '',
          course_title_en: course?.title_en ?? '',
          course_title_ar: course?.title_ar ?? '',
          category: course?.category ?? '',
          price_per_month: course?.price_per_month ?? 0,
          schedule_days: course?.schedule_days ?? null,
          schedule_time_start: course?.schedule_time_start ?? null,
          schedule_time_end: course?.schedule_time_end ?? null,
          status: e.status,
          teacher_name_en: teacher?.name_en ?? null,
          teacher_name_ar: teacher?.name_ar ?? null,
        };
      });

      const invoiceRows: ParentCourseInvoiceRow[] = (invoicesRes.data ?? []).map((inv) => {
        const child = childMap.get(inv.child_id);
        const course = courseMap.get(inv.course_id);
        return {
          ...inv,
          course_title_en: course?.title_en ?? '',
          course_title_ar: course?.title_ar ?? '',
          child_name_en: child?.full_name_en ?? '',
          child_name_ar: child?.full_name_ar ?? '',
        };
      });

      return { enrollments: enrollmentRows, invoices: invoiceRows };
    },
    enabled: Boolean(parentUserId),
  });

  useEffect(() => {
    if (!parentUserId) return;
    const channel = supabase
      .channel(`parent-courses-${parentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_enrollments' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'course_invoices' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [parentUserId, queryClient, key]);

  return query;
}
