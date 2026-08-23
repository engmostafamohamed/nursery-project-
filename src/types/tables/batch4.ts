export type LoyaltyRedemptionStatus = 'pending' | 'approved' | 'fulfilled' | 'cancelled';

export interface LoyaltyPointsRow {
  id: string;
  nursery_id: string;
  parent_id: string;
  points: number;
  reason: string | null;
  trigger_type: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyRewardsRow {
  id: string;
  nursery_id: string;
  title_ar: string;
  title_en: string;
  description_ar: string | null;
  description_en: string | null;
  points_cost: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyRedemptionsRow {
  id: string;
  reward_id: string;
  parent_id: string;
  status: LoyaltyRedemptionStatus;
  redeemed_at: string;
  created_at: string;
  updated_at: string;
}

export interface BusRoutesRow {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  driver_id: string | null;
  matron_id: string | null;
  stops_json: Record<string, unknown> | null;
  schedule_json: Record<string, unknown> | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusAttendanceRow {
  id: string;
  child_id: string;
  route_id: string;
  ride_date: string;
  boarded: boolean | null;
  alighted: boolean | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRow {
  id: string;
  staff_id: string;
  month: number;
  year: number;
  base_salary: string;
  allowances: string | null;
  deductions: string | null;
  net_salary: string;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryRow {
  id: string;
  nursery_id: string;
  item_name: string;
  category: string;
  quantity: string;
  unit: string;
  reorder_level: string | null;
  low_stock_threshold: string | null;
  last_restocked: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoodMenusRow {
  id: string;
  nursery_id: string;
  week_of: string;
  meals_json: Record<string, unknown>;
  is_halal: boolean;
  ramadan_mode: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CommunityModerationStatus = 'pending' | 'approved' | 'rejected';

export interface CommunityPostsRow {
  id: string;
  nursery_id: string;
  class_id: string | null;
  author_id: string;
  content_ar: string;
  content_en: string;
  status: CommunityModerationStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityCommentsRow {
  id: string;
  post_id: string;
  author_id: string;
  content_ar: string;
  content_en: string;
  status: CommunityModerationStatus;
  created_at: string;
  updated_at: string;
}

export type HealthArticleStatus = 'draft' | 'published' | 'archived';

export interface HealthArticlesRow {
  id: string;
  category: string;
  age_group: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  pinned_by_nursery_id: string | null;
  status: HealthArticleStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationChannel = 'in_app' | 'whatsapp' | 'push' | 'sms' | 'email';

export interface NotificationsRow {
  id: string;
  nursery_id: string | null;
  user_id: string;
  type: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  read: boolean;
  channel: NotificationChannel;
  /** Optional app route (e.g. /parent/invoices/uuid) for notification center navigation */
  action_link: string | null;
  related_broadcast_id: string | null;
  sent_at: string;
  created_at: string;
  updated_at: string;
}
