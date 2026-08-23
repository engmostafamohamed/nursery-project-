-- Migration 054: User Push Subscriptions
-- Stores web push notification subscriptions for parents and teachers

CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "users_manage_own_push_subscriptions"
ON user_push_subscriptions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_id 
ON user_push_subscriptions(user_id);

COMMENT ON TABLE user_push_subscriptions IS
'Stores web push notification subscriptions for PWA notifications';;
