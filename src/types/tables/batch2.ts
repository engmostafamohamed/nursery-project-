export type AdmissionStatus =
  | 'inquiry'
  | 'waitlist'
  | 'applied'
  | 'interview'
  | 'accepted'
  | 'rejected'
  | 'enrolled';

export interface AdmissionsRow {
  id: string;
  nursery_id: string;
  inquiry_date: string;
  applicant_name_ar: string;
  applicant_name_en: string;
  dob: string | null;
  parent_name_ar: string;
  parent_name_en: string;
  parent_phone: string;
  linked_parent_user_id: string | null;
  status: AdmissionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdmissionDocumentsRow {
  id: string;
  admission_id: string;
  doc_type: string;
  file_url: string | null;
  verified: boolean;
  expiry_date: string | null;
  verification_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecordsRow {
  id: string;
  child_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  extra_hours: string | null;
  pickup_person_id: string | null;
  qr_scan_log: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface StaffAttendanceRow {
  id: string;
  staff_id: string | null;
  user_id: string;
  nursery_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  work_hours: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type HealthRecordType = 'vaccination' | 'visit' | 'allergy' | 'other';

export interface HealthRecordsRow {
  id: string;
  child_id: string;
  record_type: HealthRecordType;
  record_date: string;
  notes: string | null;
  file_url: string | null;
  doctor_name: string | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneCategory =
  | 'motor_skills'
  | 'social'
  | 'cognitive'
  | 'language'
  | 'self_care'
  | 'creative';

export interface MilestonesRow {
  id: string;
  nursery_id: string;
  child_id: string;
  teacher_id: string;
  category: MilestoneCategory;
  milestone_text: string;
  achieved_at: string;
  notes: string | null;
  photo_url: string | null;
  shared_with_parent: boolean;
  created_at: string;
  updated_at?: string;
}

export type EventCategory = 'trip' | 'activity' | 'service' | 'doctor_visit';
export type EventTargetScope = 'all' | 'class' | 'individual';

export interface EventsRow {
  id: string;
  nursery_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  starts_at: string;
  ends_at: string | null;
  permission_deadline: string | null;
  location: string | null;
  category: EventCategory;
  is_urgent: boolean;
  urgent_days_of_week: number[];
  urgent_hours_of_day: number[];
  urgent_repeats_weekly: boolean;
  is_paid: boolean;
  price: string | null;
  target_scope: EventTargetScope;
  target_class_id: string | null;
  status: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventAttendeesRow {
  id: string;
  event_id: string;
  child_id: string;
  permission_required: boolean;
  created_at: string;
  updated_at: string;
}

export type PermissionStatus = 'pending' | 'granted' | 'denied' | 'declined';

export interface PermissionsRow {
  id: string;
  child_id: string;
  event_id: string | null;
  permission_type: string;
  status: PermissionStatus;
  deadline: string | null;
  parent_note: string | null;
  admin_note: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DailyReportMood = 'happy' | 'neutral' | 'sad' | 'tired' | 'upset';

export interface DailyReportsRow {
  id: string;
  nursery_id: string;
  child_id: string;
  report_date: string;
  teacher_id: string;
  status: 'draft' | 'published';
  meals_json: {
    breakfast?: { appetite?: string; notes?: string };
    lunch?: { appetite?: string; notes?: string };
    snacks?: { appetite?: string; notes?: string };
    water?: string;
    meal_photo_media_id?: string | null;
  } | null;
  nap_json: {
    napped?: boolean;
    start_time?: string | null;
    end_time?: string | null;
    duration_minutes?: number | null;
    quality?: string | null;
    notes?: string | null;
  } | null;
  mood_json: {
    mood?: DailyReportMood | null;
    energy_level?: string | null;
    notes?: string | null;
  } | null;
  toilet_json: {
    diaper_changes?: number | null;
    potty_training?: boolean;
    successes?: number | null;
    accidents?: number | null;
    notes?: string | null;
  } | null;
  activities_json: {
    participated_in?: string[];
    other_activity?: string | null;
    engagement_level?: string | null;
    notes?: string | null;
  } | null;
  feeding_json: {
    bottle_feeds_count?: number | null;
    bottle_amount_ml?: number | null;
    nursing_count?: number | null;
    nursing_duration_minutes?: number | null;
    solid_foods?: boolean;
    notes?: string | null;
  } | null;
  special_notes: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface InvoicesRow {
  id: string;
  generated_invoice_number: string | null;
  nursery_id: string;
  parent_id: string;
  amount: string;
  due_date: string;
  status: InvoiceStatus;
  invoice_type: 'monthly' | 'event' | 'extra_hours' | 'other';
  line_items_json: Record<string, unknown>;
  payment_method: string | null;
  paid_at: string | null;
  last_reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventInvoicesRow {
  id: string;
  event_id: string;
  permission_id: string;
  invoice_id: string;
  parent_id: string;
  child_id: string;
  nursery_id: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentAttemptsRow {
  id: string;
  invoice_id: string;
  parent_id: string;
  nursery_id: string;
  amount: string;
  payment_method: string;
  status: 'pending_confirmation' | 'confirmed' | 'failed' | 'cancelled';
  proof_url: string | null;
  paymob_transaction_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  notes: string | null;
}

export interface QrTokensRow {
  id: string;
  child_id: string;
  nursery_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}
