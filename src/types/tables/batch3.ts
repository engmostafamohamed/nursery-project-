import type { UserRole } from '../enums';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface PaymentsRow {
  id: string;
  invoice_id: string;
  amount: string;
  method: string;
  gateway_ref: string | null;
  status: PaymentStatus;
  paid_at: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionInvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface SubscriptionInvoicesRow {
  id: string;
  nursery_id: string;
  amount: string;
  period_start: string;
  period_end: string;
  status: SubscriptionInvoiceStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MediaType = 'photo' | 'video';

export interface MediaRow {
  id: string;
  nursery_id: string;
  uploaded_by: string;
  file_url: string;
  file_type: MediaType;
  thumbnail_url: string | null;
  captured_at: string;
  uploaded_at: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  class_id: string | null;
  activity_type: string | null;
  caption: string | null;
  visibility: 'all_class' | 'tagged_only' | 'specific_parents';
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface MediaChildrenRow {
  id: string;
  media_id: string;
  child_id: string;
  created_at: string;
}

export interface MediaVisibilityRow {
  id: string;
  media_id: string;
  parent_id: string;
  created_at: string;
}

export interface ReportReactionsRow {
  id: string;
  report_id: string;
  parent_id: string;
  reaction: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export type StaffDepartment = 'teaching' | 'admin' | 'kitchen' | 'maintenance' | 'security' | 'driver';
export type StaffContractType = 'full_time' | 'part_time' | 'contract' | 'temporary';

export interface StaffProfilesRow {
  id: string;
  user_id: string;
  nursery_id: string;
  employee_id: string;
  department: StaffDepartment;
  position: string;
  hire_date: string;
  contract_type: StaffContractType;
  salary_amount: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  national_id: string | null;
  qualifications_json: Record<string, unknown>[];
  documents_json: Record<string, unknown>[];
  hr_extended_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StaffSchedulesRow {
  id: string;
  staff_id: string;
  nursery_id: string;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_working_day: boolean;
  created_at: string;
}

export type StaffPayrollPaymentMethod = 'cash' | 'bank_transfer' | 'check';
export type StaffPayrollStatus = 'pending' | 'paid';

export interface StaffPayrollRow {
  id: string;
  staff_id: string;
  nursery_id: string;
  pay_period_start: string;
  pay_period_end: string;
  base_salary: string;
  bonuses: string;
  deductions: string;
  total_amount: string;
  payment_method: StaffPayrollPaymentMethod;
  payment_date: string | null;
  payment_status: StaffPayrollStatus;
  notes: string | null;
  payslip_url: string | null;
  created_by: string | null;
  paid_by: string | null;
  created_at: string;
}

export type InquirySource = 'website' | 'referral' | 'walk_in' | 'social_media' | 'other';
export type InquiryStatus = 'new' | 'contacted' | 'scheduled' | 'waitlisted' | 'enrolled' | 'declined';

export interface InquiriesRow {
  id: string;
  nursery_id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  child_name: string;
  child_dob: string;
  preferred_class: string | null;
  preferred_start_date: string | null;
  source: InquirySource;
  message: string | null;
  status: InquiryStatus;
  assigned_to: string | null;
  admin_notes: string | null;
  declined_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type WaitlistStatus = 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';

export interface WaitlistRow {
  id: string;
  inquiry_id: string;
  nursery_id: string;
  class_id: string;
  position: number;
  added_at: string;
  notified_at: string | null;
  status: WaitlistStatus;
}

export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'documents_pending' | 'approved' | 'rejected';
export type ApplicationDocumentType = 'birth_certificate' | 'vaccination_card' | 'parent_id' | 'proof_of_address' | 'medical_report' | 'other';

export interface ApplicationsRow {
  id: string;
  inquiry_id: string | null;
  nursery_id: string;
  parent_id: string | null;
  child_id: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  parent_info_json: Record<string, unknown>;
  child_info_json: Record<string, unknown>;
  terms_accepted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDocumentsRow {
  id: string;
  application_id: string;
  document_type: ApplicationDocumentType;
  file_url: string;
  uploaded_at: string;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
}

export type LoyaltyTransactionType = 'earned' | 'redeemed' | 'expired' | 'bonus';
export type LoyaltyTransactionSource = 'payment' | 'referral' | 'review' | 'birthday' | 'bonus' | 'manual';

export interface LoyaltyTransactionsRow {
  id: string;
  nursery_id: string;
  parent_id: string;
  transaction_type: LoyaltyTransactionType;
  points: number;
  source: LoyaltyTransactionSource;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface CamerasRow {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  location: string | null;
  stream_url_rtsp: string | null;
  active: boolean;
  class_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CameraAccessRow {
  id: string;
  camera_id: string;
  parent_id: string;
  granted_by: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageType = 'text' | 'image';

export interface MessagesRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  type: MessageType;
  created_at: string;
  updated_at: string;
}

export type BroadcastAudienceScope = 'all_parents' | 'class' | 'role';

export type BroadcastDeliveryStatus = 'draft' | 'scheduled' | 'sent' | 'failed';

/** Subset of notification channels used for broadcast fan-out */
export type BroadcastChannel = 'in_app' | 'whatsapp' | 'sms' | 'email';

export interface BroadcastMessagesRow {
  id: string;
  nursery_id: string;
  sender_id: string;
  target_role: UserRole;
  content_ar: string;
  content_en: string;
  /** When the broadcast was delivered to recipients; null while scheduled */
  sent_at: string | null;
  audience_scope: BroadcastAudienceScope;
  class_id: string | null;
  channels: BroadcastChannel[];
  scheduled_for: string | null;
  delivery_status: BroadcastDeliveryStatus;
  recipient_count: number;
  read_count: number;
  created_at: string;
  updated_at: string;
}

export type SurveyStatus = 'draft' | 'active' | 'published' | 'closed';

export interface SurveysRow {
  id: string;
  nursery_id: string;
  title: string | null;
  title_ar: string;
  title_en: string;
  target_role: UserRole;
  questions_json: Record<string, unknown>;
  due_date: string | null;
  status: SurveyStatus;
  created_at: string;
  updated_at: string;
}

export interface SurveyResponsesRow {
  id: string;
  survey_id: string;
  user_id: string;
  answers_json: Record<string, unknown>;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface MealPlansRow {
  id: string;
  nursery_id: string;
  week_start_date: string;
  meals_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PostsRow {
  id: string;
  nursery_id: string;
  author_id: string;
  post_type: 'announcement' | 'tip' | 'question';
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
}

export interface PostCommentsRow {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface ContentLibraryRow {
  id: string;
  nursery_id: string;
  title: string;
  category: 'parenting_tips' | 'activities' | 'recipes' | 'health';
  content: string;
  media_url: string | null;
  created_at: string;
}

export interface NpsRatingsRow {
  id: string;
  nursery_id: string;
  parent_id: string;
  trigger_type: string;
  score: number;
  comment: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}
