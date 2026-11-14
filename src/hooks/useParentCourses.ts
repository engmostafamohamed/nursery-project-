import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  ChildrenRow,
  CourseEnrollmentsRow,
  CourseInvoicesRow,
  CoursesRow,
  ParentChildrenRow,
  UsersRow,
} from '@/types/tables';

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
  /** The family invoice it is paid through (null for a bill made before 14 Nov 2026 and settled). */
  invoice_id: string | null;
};

export function useParentCourses(parentUserId: string | undefined) {
  const query = useQuery({
    queryKey: ['parent-courses', parentUserId],
    queryFn: async (): Promise<{ enrollments: ParentCourseRow[]; invoices: ParentCourseInvoiceRow[] }> => {
      if (!parentUserId) return { enrollments: [], invoices: [] };

      const { data: links } = await supabase
        .from('parent_children')
        .select('child_id')
        .eq('parent_id', parentUserId);

      const childIds = ((links ?? []) as Pick<ParentChildrenRow, 'child_id'>[]).map((l) => l.child_id);
      if (childIds.length === 0) return { enrollments: [], invoices: [] };

      const { data: children } = await supabase
        .from('children')
        .select('id, full_name_en, full_name_ar')
        .in('id', childIds);

      // The active courses, and every bill (a course the child left can still have one to pay).
      const [enrollRes, invoicesRes] = await Promise.all([
        supabase.from('course_enrollments').select('id, course_id, child_id, status').in('child_id', childIds).eq('status', 'active'),
        supabase
          .from('course_invoices')
          .select('id, course_id, enrollment_id, child_id, billing_month, amount, currency, status, due_date, paid_at, invoice_number, invoice_id')
          .in('child_id', childIds)
          .order('billing_month', { ascending: false }),
      ]);
      if (enrollRes.error) throw enrollRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      const enrollments = (enrollRes.data ?? []) as Pick<CourseEnrollmentsRow, 'id' | 'course_id' | 'child_id' | 'status'>[];
      const invoices = (invoicesRes.data ?? []) as (Omit<CourseInvoicesRow, 'nursery_id' | 'notes' | 'created_at' | 'updated_at'> & { invoice_id: string | null })[];
      if (enrollments.length === 0 && invoices.length === 0) return { enrollments: [], invoices: [] };

      const courseIds = [...new Set([...enrollments, ...invoices].map((e) => e.course_id))];
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select('id, title_en, title_ar, category, price_per_month, schedule_days, schedule_time_start, schedule_time_end, status, teacher_user_id')
        .in('id', courseIds);
      if (courseErr) throw courseErr;
      const courses = (courseData ?? []) as Pick<
        CoursesRow,
        'id' | 'title_en' | 'title_ar' | 'category' | 'price_per_month' | 'schedule_days' | 'schedule_time_start' | 'schedule_time_end' | 'status' | 'teacher_user_id'
      >[];

      const teacherIds = [...new Set(courses.map((c) => c.teacher_user_id).filter(Boolean))] as string[];
      const teachersRes = teacherIds.length
        ? await supabase.from('users').select('id, name_en, name_ar').in('id', teacherIds)
        : { data: [] };

      const childMap = new Map(
        ((children ?? []) as Pick<ChildrenRow, 'id' | 'full_name_en' | 'full_name_ar'>[]).map((c) => [c.id, c]),
      );
      const courseMap = new Map(courses.map((c) => [c.id, c]));
      const teacherMap = new Map(
        ((teachersRes.data ?? []) as Pick<UsersRow, 'id' | 'name_en' | 'name_ar'>[]).map((u) => [u.id, u]),
      );

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

      const invoiceRows: ParentCourseInvoiceRow[] = invoices.map((inv) => {
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

  return query;
}
