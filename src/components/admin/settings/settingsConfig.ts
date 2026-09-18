import type { NurserySettingsRow } from '@/types/tables/nursery_settings';

export type SettingsKey = Exclude<keyof NurserySettingsRow, 'id' | 'nursery_id' | 'created_at' | 'updated_at'>;
export type SettingsTabId =
  | 'operations'
  | 'admissions'
  | 'eventsPermissions'
  | 'communication'
  | 'financial'
  | 'summerPause'
  | 'mediaPrivacy'
  | 'cctv'
  | 'loyalty'
  | 'localization'
  | 'branding';

export type FieldType =
  | 'time'
  | 'number'
  | 'boolean'
  | 'select'
  | 'date'
  | 'color'
  | 'payment_methods'
  | 'loyalty_thresholds'
  | 'text';

export interface SettingsField {
  key: SettingsKey;
  type: FieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface SettingsTabConfig {
  id: SettingsTabId;
  labelKey: string;
  fields: SettingsField[];
}

export const DEFAULT_SETTINGS: Record<SettingsKey, unknown> = {
  standard_start_time: '07:00',
  standard_end_time: '17:00',
  late_pickup_grace_minutes: 15,
  late_pickup_fee_per_hour: '50.00',
  absence_alert_time: '09:30',
  end_of_day_checklist_time: '17:00',
  permission_deadline_default_hours: 24,
  event_cancellation_window_hours: 48,
  paid_event_refund_policy: 'none',
  quiet_hours_start: '21:00',
  quiet_hours_end: '07:00',
  max_whatsapp_per_parent_per_day: 10,
  allow_parent_quiet_hours_override: true,
  auto_payment_reminders_enabled: true,
  auto_permission_reminders_enabled: true,
  auto_monthly_teacher_reminders_enabled: true,
  parent_registration_enabled: true,
  show_event_attendee_list: true,
  pricing_model: 'fixed',
  monthly_rate: null,
  per_child_rate: null,
  hourly_rate: null,
  invoice_due_days: 7,
  late_payment_fee_percentage: '5.00',
  sibling_discount_2nd_child_percentage: '10.00',
  sibling_discount_3rd_child_percentage: '15.00',
  payment_methods_enabled: ['paymob', 'cash', 'bank_transfer'],
  summer_pause_enabled: true,
  summer_pause_min_weeks: 2,
  summer_pause_max_weeks: 16,
  summer_pause_auto_start_date: null,
  summer_pause_auto_end_date: null,
  summer_pause_charges_percentage: '0.00',
  photo_approval_required: true,
  photo_auto_approve_after_hours: null,
  video_enabled: false,
  max_photo_per_child_per_day: 10,
  cctv_enabled: false,
  cctv_stream_token_duration_minutes: 30,
  cctv_max_concurrent_viewers_per_camera: 5,
  cctv_recording_retention_days: 7,
  loyalty_enabled: true,
  points_per_egp: '1.00',
  points_redemption_rate: '0.10',
  loyalty_tier_thresholds: { silver: 0, gold: 1000, platinum: 5000 },
  default_language: 'ar',
  timezone: 'Africa/Cairo',
  currency: 'EGP',
  date_format: 'DD/MM/YYYY',
  primary_color: '#4F46E5',
  secondary_color: '#06B6D4',
  accent_color: '#F59E0B',
};

export const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    id: 'operations',
    labelKey: 'settings.tabs.operations',
    fields: [
      { key: 'standard_start_time', type: 'time' },
      { key: 'standard_end_time', type: 'time' },
      { key: 'late_pickup_grace_minutes', type: 'number', min: 0 },
      { key: 'late_pickup_fee_per_hour', type: 'number', min: 0, step: 0.01 },
      { key: 'absence_alert_time', type: 'time' },
      { key: 'end_of_day_checklist_time', type: 'time' },
    ],
  },
  {
    id: 'admissions',
    labelKey: 'settings.tabs.admissions',
    fields: [
      { key: 'parent_registration_enabled', type: 'boolean' },
    ],
  },
  {
    id: 'eventsPermissions',
    labelKey: 'settings.tabs.eventsPermissions',
    fields: [
      { key: 'permission_deadline_default_hours', type: 'number', min: 1 },
      { key: 'event_cancellation_window_hours', type: 'number', min: 1 },
      { key: 'paid_event_refund_policy', type: 'select', options: ['full', 'partial', 'none'] },
      { key: 'show_event_attendee_list', type: 'boolean' },
    ],
  },
  {
    id: 'communication',
    labelKey: 'settings.tabs.communication',
    fields: [
      { key: 'quiet_hours_start', type: 'time' },
      { key: 'quiet_hours_end', type: 'time' },
      { key: 'max_whatsapp_per_parent_per_day', type: 'number', min: 0 },
      { key: 'allow_parent_quiet_hours_override', type: 'boolean' },
      { key: 'auto_payment_reminders_enabled', type: 'boolean' },
      { key: 'auto_permission_reminders_enabled', type: 'boolean' },
      { key: 'auto_monthly_teacher_reminders_enabled', type: 'boolean' },
    ],
  },
  {
    id: 'financial',
    labelKey: 'settings.tabs.financial',
    fields: [
      { key: 'pricing_model', type: 'select', options: ['fixed', 'per_child', 'hourly', 'hybrid'] },
      { key: 'monthly_rate', type: 'number', min: 0, step: 0.01 },
      { key: 'per_child_rate', type: 'number', min: 0, step: 0.01 },
      { key: 'hourly_rate', type: 'number', min: 0, step: 0.01 },
      { key: 'invoice_due_days', type: 'number', min: 0 },
      { key: 'late_payment_fee_percentage', type: 'number', min: 0, max: 100, step: 0.01 },
      { key: 'sibling_discount_2nd_child_percentage', type: 'number', min: 0, max: 100, step: 0.01 },
      { key: 'sibling_discount_3rd_child_percentage', type: 'number', min: 0, max: 100, step: 0.01 },
      { key: 'payment_methods_enabled', type: 'payment_methods' },
    ],
  },
  {
    id: 'summerPause',
    labelKey: 'settings.tabs.summerPause',
    fields: [
      { key: 'summer_pause_enabled', type: 'boolean' },
      { key: 'summer_pause_min_weeks', type: 'number', min: 0 },
      { key: 'summer_pause_max_weeks', type: 'number', min: 0 },
      { key: 'summer_pause_auto_start_date', type: 'date' },
      { key: 'summer_pause_auto_end_date', type: 'date' },
      { key: 'summer_pause_charges_percentage', type: 'number', min: 0, max: 100, step: 0.01 },
    ],
  },
  {
    id: 'mediaPrivacy',
    labelKey: 'settings.tabs.mediaPrivacy',
    fields: [
      { key: 'photo_approval_required', type: 'boolean' },
      { key: 'photo_auto_approve_after_hours', type: 'number', min: 0 },
      { key: 'video_enabled', type: 'boolean' },
      { key: 'max_photo_per_child_per_day', type: 'number', min: 0 },
    ],
  },
  {
    id: 'cctv',
    labelKey: 'settings.tabs.cctv',
    fields: [
      { key: 'cctv_enabled', type: 'boolean' },
      { key: 'cctv_stream_token_duration_minutes', type: 'number', min: 1 },
      { key: 'cctv_max_concurrent_viewers_per_camera', type: 'number', min: 1 },
      { key: 'cctv_recording_retention_days', type: 'number', min: 1 },
    ],
  },
  {
    id: 'loyalty',
    labelKey: 'settings.tabs.loyalty',
    fields: [
      { key: 'loyalty_enabled', type: 'boolean' },
      { key: 'points_per_egp', type: 'number', min: 0, step: 0.01 },
      { key: 'points_redemption_rate', type: 'number', min: 0, step: 0.01 },
      { key: 'loyalty_tier_thresholds', type: 'loyalty_thresholds' },
    ],
  },
  {
    id: 'localization',
    labelKey: 'settings.tabs.localization',
    fields: [
      { key: 'default_language', type: 'select', options: ['ar', 'en'] },
      { key: 'timezone', type: 'text' },
      { key: 'currency', type: 'text' },
      { key: 'date_format', type: 'text' },
    ],
  },
  {
    id: 'branding',
    labelKey: 'settings.tabs.branding',
    fields: [
      { key: 'primary_color', type: 'color' },
      { key: 'secondary_color', type: 'color' },
      { key: 'accent_color', type: 'color' },
    ],
  },
];

export function getTabConfig(tabId: SettingsTabId) {
  return SETTINGS_TABS.find((tab) => tab.id === tabId) ?? SETTINGS_TABS[0];
}
