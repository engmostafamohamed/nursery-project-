export interface UserPushSubscriptionsRow {
  id: string;
  user_id: string;
  nursery_id: string | null;
  endpoint: string;
  subscription_json: unknown;
  created_at: string;
  updated_at: string;
}
