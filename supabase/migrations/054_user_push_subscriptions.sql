-- Web Push subscription storage (VAPID public key lives in env; endpoint + keys stored here per device).

CREATE TABLE public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  nursery_id uuid REFERENCES public.nurseries (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  subscription_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_subscriptions_user_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_user_push_subscriptions_nursery_id ON public.user_push_subscriptions (nursery_id);
CREATE INDEX idx_user_push_subscriptions_user_id ON public.user_push_subscriptions (user_id);

CREATE TRIGGER trg_user_push_subscriptions_updated_at
BEFORE UPDATE ON public.user_push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_push_subscriptions_select_own ON public.user_push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_push_subscriptions_insert_own ON public.user_push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_push_subscriptions_update_own ON public.user_push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY user_push_subscriptions_delete_own ON public.user_push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
