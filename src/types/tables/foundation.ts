import type { Department, UserRole } from '../enums';

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface ChildDailyCarePreferences {
  arrival_time: string | null;
  takes_breakfast_at_home: boolean | null;
  eats_nursery_meals: boolean | null;
  food_allergies: string | null;
  sends_extra_snacks: boolean | null;
  snack_type: string | null;
  unfinished_snack_action: string | null;
  nursery_meals_preference: string | null;
  sends_vitamins: boolean | null;
  time_between_meals: string | null;
  water_preference: string | null;
  extra_meal_preference: string | null;
  diaper_supply_method: 'stock' | 'daily' | null;
  daily_diaper_count: number | null;
  rash_cream_usage: string | null;
  diaper_change_schedule: string | null;
  diaper_change_frequency: string | null;
  toilet_training_status: string | null;
  nap_time_preference: string | null;
  max_nap_time: string | null;
  emergency_medications: string[] | null;
}

export interface ChainsRow {
  id: string;
  name: string;
  billing_email: string | null;
  negotiated_rate: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NurseriesRow {
  id: string;
  chain_id: string | null;
  name_ar: string;
  name_en: string;
  language_pref: 'ar' | 'en' | 'both';
  city: string | null;
  phone: string | null;
  logo_url: string | null;
  address_ar: string | null;
  address_en: string | null;
  about_ar: string | null;
  about_en: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  opens_at: string | null;
  closes_at: string | null;
  working_days: string[];
  /** Departments offered, shown in the parent signup form's department dropdown. */
  departments: string[] | null;
  subscription_plan: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
    suspended_at: string | null;
    suspension_reason: string | null;
    deleted_at: string | null;
    pricing_model: string | null;
  base_fee: string | null;
  per_child_fee: string | null;
  bank_account_details: Record<string, unknown> | null;
  branch_count: number;
  created_at: string;
  updated_at: string;
}

export interface UsersRow {
  id: string;
  nursery_id: string | null;
  chain_id: string | null;
  role: UserRole;
  /** FK to public.roles. Drives the DB-driven permission matrix. Null until backfilled or for legacy rows. */
  role_id: string | null;
  /** Specialisation for the `manager` role (the "Finance" / "HR" columns). Null for other roles. */
  department: Department | null;
  name_ar: string;
  name_en: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  id_photo_url: string | null;
  status: string;
  language_pref: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassesRow {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  grade_level: string | null;
  capacity: number | null;
  room_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffNationalIdsRow {
  id: string;
  user_id: string;
  nursery_id: string;
  staff_profile_id: string | null;
  document_path: string;
  document_mime: string | null;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ClassStaffRole = 'lead' | 'assistant';

export interface ClassStaffRow {
  id: string;
  class_id: string;
  user_id: string;
  role: ClassStaffRole;
  created_at: string;
  updated_at: string;
}

export interface ChildrenRow {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  dob: string;
  gender: 'male' | 'female' | null;
  nationality: string | null;
  enrollment_department: string | null;
  school_preference: string | null;
  school_admissions_plan: string | null;
  academic_year: string | null;
  has_siblings: boolean | null;
  sibling_ages: string | null;
  birth_certificate_url: string | null;
  vaccination_card_url: string | null;
  class_id: string | null;
  enrollment_date: string | null;
  status: string;
  sibling_group_id: string | null;
  photo_privacy_restricted: boolean;
  avatar_url: string | null;
  daily_care_preferences: ChildDailyCarePreferences | null;
  emergency_contacts: EmergencyContact[] | null;
  enrollment_extended_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ParentRelationship = 'father' | 'mother' | 'guardian';

export interface ParentChildrenRow {
  id: string;
  parent_id: string;
  child_id: string;
  relationship: ParentRelationship | null;
  created_at: string;
  updated_at: string;
}

export interface StaffRow {
  id: string;
  user_id: string;
  nursery_id: string;
  department: string | null;
  base_salary: string | null;
  allowances_json: Record<string, unknown> | null;
  deductions_json: Record<string, unknown> | null;
  hire_date: string | null;
  contract_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PickupAuthorizationLevel = 'anytime' | 'scheduled' | 'emergency_only';

export interface AuthorizedPickupsRow {
  id: string;
  child_id: string;
  name: string;
  phone: string;
  relation: string | null;
  photo_url: string | null;
  authorization_level: PickupAuthorizationLevel | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicCalendarsRow {
  id: string;
  nursery_id: string;
  year: number;
  holidays_json: Record<string, unknown> | null;
  term_dates_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceDocsRow {
  id: string;
  nursery_id: string;
  doc_type: string;
  file_url: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string | null;
  renewal_alert_days: number | null;
  created_at: string;
  updated_at: string;
}
