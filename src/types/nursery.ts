import type { NurseriesRow, UsersRow } from '@/types/tables/foundation';

export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'cancelled' | 'deleted' | 'expired';

export type SubscriptionPlan = 'starter' | 'professional' | 'enterprise';

export type PricingModel = 'fixed' | 'per_child' | 'hourly' | 'hybrid';

export interface Nursery extends NurseriesRow {
  subscription_plan: SubscriptionPlan | null;
  subscription_status: SubscriptionStatus | null;
  pricing_model: PricingModel | null;
}

export interface NurseryStats {
  totalChildren: number;
  totalStaff: number;
  activeParents: number;
}

export type NurseryUserSummary = Pick<UsersRow, 'id' | 'role' | 'name_ar' | 'name_en' | 'email' | 'phone' | 'status'>;

