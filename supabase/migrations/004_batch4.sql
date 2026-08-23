-- XO Nursery — Batch 4 (12 tables): loyalty, bus, payroll, inventory, food,
-- community, health content, notifications.
-- Requires: 001_foundation.sql, 002_batch2.sql, 003_batch3.sql applied.

BEGIN;

-- -----------------------------------------------------------------------------
-- loyalty_points (ledger / transaction rows)
-- -----------------------------------------------------------------------------
CREATE TABLE public.loyalty_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text,
  trigger_type text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_nursery_id ON public.loyalty_points (nursery_id);
CREATE INDEX idx_loyalty_points_parent_id ON public.loyalty_points (parent_id);

CREATE TRIGGER trg_loyalty_points_updated_at
BEFORE UPDATE ON public.loyalty_points
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- loyalty_rewards
-- -----------------------------------------------------------------------------
CREATE TABLE public.loyalty_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  description_ar text,
  description_en text,
  points_cost integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loyalty_rewards_nursery_id ON public.loyalty_rewards (nursery_id);

CREATE TRIGGER trg_loyalty_rewards_updated_at
BEFORE UPDATE ON public.loyalty_rewards
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- loyalty_redemptions
-- -----------------------------------------------------------------------------
CREATE TABLE public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.loyalty_rewards (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  redeemed_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_redemptions_status_ck CHECK (
    status IN ('pending', 'approved', 'fulfilled', 'cancelled')
  )
);

CREATE INDEX idx_loyalty_redemptions_reward_id ON public.loyalty_redemptions (reward_id);
CREATE INDEX idx_loyalty_redemptions_parent_id ON public.loyalty_redemptions (parent_id);

CREATE TRIGGER trg_loyalty_redemptions_updated_at
BEFORE UPDATE ON public.loyalty_redemptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- bus_routes
-- -----------------------------------------------------------------------------
CREATE TABLE public.bus_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  driver_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  matron_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  stops_json jsonb,
  schedule_json jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bus_routes_nursery_id ON public.bus_routes (nursery_id);

CREATE TRIGGER trg_bus_routes_updated_at
BEFORE UPDATE ON public.bus_routes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bus_routes ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- bus_attendance
-- -----------------------------------------------------------------------------
CREATE TABLE public.bus_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.bus_routes (id) ON DELETE CASCADE,
  ride_date date NOT NULL,
  boarded boolean,
  alighted boolean,
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT bus_attendance_child_route_day_uniq UNIQUE (child_id, route_id, ride_date)
);

CREATE INDEX idx_bus_attendance_child_id ON public.bus_attendance (child_id);
CREATE INDEX idx_bus_attendance_route_id ON public.bus_attendance (route_id);

CREATE TRIGGER trg_bus_attendance_updated_at
BEFORE UPDATE ON public.bus_attendance
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bus_attendance ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- payroll
-- -----------------------------------------------------------------------------
CREATE TABLE public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  base_salary numeric(12, 2) NOT NULL,
  allowances numeric(12, 2),
  deductions numeric(12, 2),
  net_salary numeric(12, 2) NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT payroll_month_ck CHECK (month >= 1 AND month <= 12),
  CONSTRAINT payroll_staff_period_uniq UNIQUE (staff_id, month, year)
);

CREATE INDEX idx_payroll_staff_id ON public.payroll (staff_id);

CREATE TRIGGER trg_payroll_updated_at
BEFORE UPDATE ON public.payroll
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- inventory
-- -----------------------------------------------------------------------------
CREATE TABLE public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  item_name text NOT NULL,
  category text NOT NULL,
  quantity numeric(12, 2) NOT NULL DEFAULT 0,
  unit text NOT NULL,
  reorder_level numeric(12, 2),
  last_restocked date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_nursery_id ON public.inventory (nursery_id);

CREATE TRIGGER trg_inventory_updated_at
BEFORE UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- food_menus
-- -----------------------------------------------------------------------------
CREATE TABLE public.food_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  week_of date NOT NULL,
  meals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_halal boolean NOT NULL DEFAULT true,
  ramadan_mode boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT food_menus_nursery_week_uniq UNIQUE (nursery_id, week_of)
);

CREATE INDEX idx_food_menus_nursery_id ON public.food_menus (nursery_id);

CREATE TRIGGER trg_food_menus_updated_at
BEFORE UPDATE ON public.food_menus
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.food_menus ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- community_posts
-- -----------------------------------------------------------------------------
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  author_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content_ar text NOT NULL,
  content_en text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT community_posts_status_ck CHECK (
    status IN ('pending', 'approved', 'rejected')
  )
);

CREATE INDEX idx_community_posts_nursery_id ON public.community_posts (nursery_id);
CREATE INDEX idx_community_posts_class_id ON public.community_posts (class_id);
CREATE INDEX idx_community_posts_author_id ON public.community_posts (author_id);

CREATE TRIGGER trg_community_posts_updated_at
BEFORE UPDATE ON public.community_posts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- community_comments
-- -----------------------------------------------------------------------------
CREATE TABLE public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content_ar text NOT NULL,
  content_en text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT community_comments_status_ck CHECK (
    status IN ('pending', 'approved', 'rejected')
  )
);

CREATE INDEX idx_community_comments_post_id ON public.community_comments (post_id);
CREATE INDEX idx_community_comments_author_id ON public.community_comments (author_id);

CREATE TRIGGER trg_community_comments_updated_at
BEFORE UPDATE ON public.community_comments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- health_articles (curated; optional pin per nursery)
-- -----------------------------------------------------------------------------
CREATE TABLE public.health_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  age_group text NOT NULL,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  body_ar text NOT NULL,
  body_en text NOT NULL,
  pinned_by_nursery_id uuid REFERENCES public.nurseries (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'published',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT health_articles_status_ck CHECK (
    status IN ('draft', 'published', 'archived')
  )
);

CREATE INDEX idx_health_articles_pinned_nursery ON public.health_articles (pinned_by_nursery_id);

CREATE TRIGGER trg_health_articles_updated_at
BEFORE UPDATE ON public.health_articles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.health_articles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- notifications (per-user log)
-- -----------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid REFERENCES public.nurseries (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  body_ar text NOT NULL,
  body_en text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  channel text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_channel_ck CHECK (
    channel IN ('in_app', 'whatsapp', 'push')
  )
);

CREATE INDEX idx_notifications_nursery_id ON public.notifications (nursery_id);
CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS — loyalty_points
-- =============================================================================
CREATE POLICY lpoints_xo_all
  ON public.loyalty_points FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY lpoints_chain_all
  ON public.loyalty_points FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY lpoints_branch_all
  ON public.loyalty_points FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY lpoints_teacher_deny
  ON public.loyalty_points FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY lpoints_parent_select
  ON public.loyalty_points FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

-- =============================================================================
-- RLS — loyalty_rewards
-- =============================================================================
CREATE POLICY lrew_xo_all
  ON public.loyalty_rewards FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY lrew_chain_all
  ON public.loyalty_rewards FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY lrew_branch_all
  ON public.loyalty_rewards FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY lrew_teacher_deny
  ON public.loyalty_rewards FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY lrew_parent_select
  ON public.loyalty_rewards FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = loyalty_rewards.nursery_id
    )
  );

-- =============================================================================
-- RLS — loyalty_redemptions
-- =============================================================================
CREATE POLICY lred_xo_all
  ON public.loyalty_redemptions FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY lred_chain_all
  ON public.loyalty_redemptions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.loyalty_rewards r
      WHERE r.id = loyalty_redemptions.reward_id
        AND r.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.loyalty_rewards r
      WHERE r.id = loyalty_redemptions.reward_id
        AND r.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY lred_branch_all
  ON public.loyalty_redemptions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.loyalty_rewards r
      WHERE r.id = loyalty_redemptions.reward_id
        AND r.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.loyalty_rewards r
      WHERE r.id = loyalty_redemptions.reward_id
        AND r.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY lred_teacher_deny
  ON public.loyalty_redemptions FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY lred_parent_own
  ON public.loyalty_redemptions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

-- =============================================================================
-- RLS — bus_routes
-- =============================================================================
CREATE POLICY broutes_xo_all
  ON public.bus_routes FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY broutes_chain_all
  ON public.bus_routes FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY broutes_branch_all
  ON public.bus_routes FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY broutes_teacher_select
  ON public.bus_routes FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY broutes_parent_select
  ON public.bus_routes FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = bus_routes.nursery_id
    )
  );

-- =============================================================================
-- RLS — bus_attendance
-- =============================================================================
CREATE POLICY batt_xo_all
  ON public.bus_attendance FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY batt_chain_all
  ON public.bus_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.bus_routes br
      WHERE br.id = bus_attendance.route_id
        AND br.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.bus_routes br
      WHERE br.id = bus_attendance.route_id
        AND br.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY batt_branch_all
  ON public.bus_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.bus_routes br
      WHERE br.id = bus_attendance.route_id
        AND br.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.bus_routes br
      WHERE br.id = bus_attendance.route_id
        AND br.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY batt_teacher_all
  ON public.bus_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.bus_routes br
      WHERE br.id = bus_attendance.route_id
        AND br.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.bus_routes br
      WHERE br.id = bus_attendance.route_id
        AND br.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY batt_parent_select
  ON public.bus_attendance FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(bus_attendance.child_id)
  );

-- =============================================================================
-- RLS — payroll
-- =============================================================================
CREATE POLICY pay_xo_all
  ON public.payroll FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY pay_chain_all
  ON public.payroll FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = payroll.staff_id
        AND s.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = payroll.staff_id
        AND s.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY pay_branch_all
  ON public.payroll FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = payroll.staff_id
        AND s.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = payroll.staff_id
        AND s.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY pay_teacher_self
  ON public.payroll FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = payroll.staff_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY pay_parent_deny
  ON public.payroll FOR SELECT TO authenticated
  USING (public.current_user_role() = 'parent' AND FALSE);

-- =============================================================================
-- RLS — inventory
-- =============================================================================
CREATE POLICY inv_xo_all
  ON public.inventory FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY inv_chain_all
  ON public.inventory FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY inv_branch_all
  ON public.inventory FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY inv_teacher_select
  ON public.inventory FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY inv_parent_deny
  ON public.inventory FOR SELECT TO authenticated
  USING (public.current_user_role() = 'parent' AND FALSE);

-- =============================================================================
-- RLS — food_menus
-- =============================================================================
CREATE POLICY food_xo_all
  ON public.food_menus FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY food_chain_all
  ON public.food_menus FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY food_branch_all
  ON public.food_menus FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY food_teacher_select
  ON public.food_menus FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY food_parent_select
  ON public.food_menus FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = food_menus.nursery_id
    )
  );

-- =============================================================================
-- RLS — community_posts
-- =============================================================================
CREATE POLICY cposts_xo_all
  ON public.community_posts FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY cposts_chain_all
  ON public.community_posts FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY cposts_branch_all
  ON public.community_posts FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY cposts_teacher_select
  ON public.community_posts FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY cposts_parent_all
  ON public.community_posts FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = community_posts.nursery_id
    )
    AND (
      author_id = auth.uid()
      OR status = 'approved'
    )
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = community_posts.nursery_id
    )
  );

-- =============================================================================
-- RLS — community_comments
-- =============================================================================
CREATE POLICY ccom_xo_all
  ON public.community_comments FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY ccom_chain_all
  ON public.community_comments FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY ccom_branch_all
  ON public.community_comments FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY ccom_teacher_select
  ON public.community_comments FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND p.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY ccom_parent_all
  ON public.community_comments FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND EXISTS (
          SELECT 1
          FROM public.children c
          JOIN public.parent_children pc ON pc.child_id = c.id
          WHERE pc.parent_id = auth.uid()
            AND c.nursery_id = p.nursery_id
        )
    )
    AND (
      author_id = auth.uid()
      OR status = 'approved'
    )
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.community_posts p
      WHERE p.id = community_comments.post_id
        AND EXISTS (
          SELECT 1
          FROM public.children c
          JOIN public.parent_children pc ON pc.child_id = c.id
          WHERE pc.parent_id = auth.uid()
            AND c.nursery_id = p.nursery_id
        )
    )
  );

-- =============================================================================
-- RLS — health_articles
-- =============================================================================
CREATE POLICY hart_xo_all
  ON public.health_articles FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY hart_chain_select
  ON public.health_articles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND status = 'published'
  );

CREATE POLICY hart_branch_select
  ON public.health_articles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND status = 'published'
  );

CREATE POLICY hart_branch_update_pin
  ON public.health_articles FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND status = 'published'
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND status = 'published'
    AND (
      pinned_by_nursery_id IS NULL
      OR pinned_by_nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY hart_teacher_select
  ON public.health_articles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND status = 'published'
  );

CREATE POLICY hart_parent_select
  ON public.health_articles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND status = 'published'
  );

-- =============================================================================
-- RLS — notifications
-- =============================================================================
CREATE POLICY notif_xo_all
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY notif_chain_all
  ON public.notifications FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND (
      nursery_id IS NULL
      OR nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND (
      nursery_id IS NULL
      OR nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY notif_branch_all
  ON public.notifications FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND (
      nursery_id IS NULL
      OR nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND (
      nursery_id IS NULL
      OR nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY notif_teacher_own
  ON public.notifications FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
  );

CREATE POLICY notif_parent_own
  ON public.notifications FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND user_id = auth.uid()
  );

COMMIT;
