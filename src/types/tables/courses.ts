/** Tables from `20260512000000_courses.sql`. */

export type CourseCategory = 'sport' | 'art' | 'music' | 'academic' | 'language' | 'other';
export type CourseStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type CourseEnrollmentStatus = 'active' | 'paused' | 'cancelled';
export type CourseInvoiceStatus = 'pending' | 'paid' | 'overdue' | 'waived';

export interface CoursesRow {
  id: string;
  nursery_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  category: CourseCategory;
  price_per_month: number;
  max_students: number | null;
  schedule_days: string[] | null;
  schedule_time_start: string | null;
  schedule_time_end: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CourseStatus;
  teacher_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseEnrollmentsRow {
  id: string;
  course_id: string;
  child_id: string;
  enrolled_by_user_id: string | null;
  status: CourseEnrollmentStatus;
  enrolled_at: string;
  unenrolled_at: string | null;
  created_at: string;
}

export interface CourseInvoicesRow {
  id: string;
  course_id: string;
  enrollment_id: string;
  child_id: string;
  nursery_id: string;
  billing_month: string;
  amount: number;
  currency: string;
  status: CourseInvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  invoice_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
