-- XO Nursery — Foundation batch (10 tables)
-- Apply via Supabase SQL editor or `supabase db push` after review.
-- Do not run until approved.

BEGIN;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM (
  'xo_super_admin',
  'chain_super_admin',
  'branch_admin',
  'teacher',
  'parent'
);

-- -----------------------------------------------------------------------------
-- updated_at trigger function (reused by all tables)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- chains (owner_id added after users table exists)
-- -----------------------------------------------------------------------------
CREATE TABLE public.chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_email text,
  negotiated_rate numeric(12, 2),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_chains_updated_at
BEFORE UPDATE ON public.chains
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chains ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- nurseries
-- -----------------------------------------------------------------------------
CREATE TABLE public.nurseries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid REFERENCES public.chains (id) ON DELETE SET NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  subscription_plan text,
  subscription_status text,
  trial_ends_at timestamptz,
  pricing_model text,
  base_fee numeric(12, 2),
  per_child_fee numeric(12, 2),
  branch_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nurseries_chain_id ON public.nurseries (chain_id);

CREATE TRIGGER trg_nurseries_updated_at
BEFORE UPDATE ON public.nurseries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nurseries ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- users (id mirrors auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nursery_id uuid REFERENCES public.nurseries (id) ON DELETE SET NULL,
  chain_id uuid REFERENCES public.chains (id) ON DELETE SET NULL,
  role public.user_role NOT NULL,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  language_pref text NOT NULL DEFAULT 'ar',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT users_chain_role_ck CHECK (
    (role = 'chain_super_admin' AND chain_id IS NOT NULL)
    OR role <> 'chain_super_admin'
  )
);

CREATE INDEX idx_users_nursery_id ON public.users (nursery_id);
CREATE INDEX idx_users_chain_id ON public.users (chain_id);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- chains.owner_id → users (nullable)
-- -----------------------------------------------------------------------------
ALTER TABLE public.chains
  ADD COLUMN owner_id uuid REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX idx_chains_owner_id ON public.chains (owner_id);

-- -----------------------------------------------------------------------------
-- classes
-- -----------------------------------------------------------------------------
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  grade_level text,
  capacity integer,
  room_number text,
  teacher_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_classes_nursery_id ON public.classes (nursery_id);
CREATE INDEX idx_classes_teacher_id ON public.classes (teacher_id);

CREATE TRIGGER trg_classes_updated_at
BEFORE UPDATE ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- children
-- -----------------------------------------------------------------------------
CREATE TABLE public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  full_name_ar text NOT NULL,
  full_name_en text NOT NULL,
  dob date NOT NULL,
  class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  enrollment_date date,
  status text NOT NULL DEFAULT 'active',
  sibling_group_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_children_nursery_id ON public.children (nursery_id);
CREATE INDEX idx_children_class_id ON public.children (class_id);

CREATE TRIGGER trg_children_updated_at
BEFORE UPDATE ON public.children
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- parent_children
-- -----------------------------------------------------------------------------
CREATE TABLE public.parent_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT parent_children_parent_child_uniq UNIQUE (parent_id, child_id)
);

CREATE INDEX idx_parent_children_parent_id ON public.parent_children (parent_id);
CREATE INDEX idx_parent_children_child_id ON public.parent_children (child_id);

CREATE TRIGGER trg_parent_children_updated_at
BEFORE UPDATE ON public.parent_children
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.parent_children ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- staff
-- -----------------------------------------------------------------------------
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  department text,
  base_salary numeric(12, 2),
  allowances_json jsonb,
  deductions_json jsonb,
  hire_date date,
  contract_url text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_user_nursery_uniq UNIQUE (user_id, nursery_id)
);

CREATE INDEX idx_staff_nursery_id ON public.staff (nursery_id);
CREATE INDEX idx_staff_user_id ON public.staff (user_id);

CREATE TRIGGER trg_staff_updated_at
BEFORE UPDATE ON public.staff
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- authorized_pickups
-- -----------------------------------------------------------------------------
CREATE TABLE public.authorized_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  relation text,
  photo_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_authorized_pickups_child_id ON public.authorized_pickups (child_id);

CREATE TRIGGER trg_authorized_pickups_updated_at
BEFORE UPDATE ON public.authorized_pickups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.authorized_pickups ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- academic_calendars
-- -----------------------------------------------------------------------------
CREATE TABLE public.academic_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  year integer NOT NULL,
  holidays_json jsonb,
  term_dates_json jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_calendars_nursery_year_uniq UNIQUE (nursery_id, year)
);

CREATE INDEX idx_academic_calendars_nursery_id ON public.academic_calendars (nursery_id);

CREATE TRIGGER trg_academic_calendars_updated_at
BEFORE UPDATE ON public.academic_calendars
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academic_calendars ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- compliance_docs
-- -----------------------------------------------------------------------------
CREATE TABLE public.compliance_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_url text,
  issued_date date,
  expiry_date date,
  status text,
  renewal_alert_days integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_docs_nursery_id ON public.compliance_docs (nursery_id);

CREATE TRIGGER trg_compliance_docs_updated_at
BEFORE UPDATE ON public.compliance_docs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.compliance_docs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS helper functions (after all tables exist; SECURITY DEFINER bypasses RLS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_xo_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'xo_super_admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_nursery_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.nursery_id
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_chain_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT u.chain_id
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.nursery_ids_for_chain_admin()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT n.id
  FROM public.nurseries n
  WHERE n.chain_id = public.current_user_chain_id();
$$;

CREATE OR REPLACE FUNCTION public.parent_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = p_child_id
  );
$$;

-- =============================================================================
-- RLS policies — chains
-- =============================================================================
CREATE POLICY chains_xo_super_admin_all
  ON public.chains
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY chains_chain_super_admin_all
  ON public.chains
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND id = public.current_user_chain_id()
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND id = public.current_user_chain_id()
  );

CREATE POLICY chains_branch_admin_select
  ON public.chains
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.nurseries n
      WHERE n.id = public.current_user_nursery_id()
        AND n.chain_id = chains.id
    )
  );

CREATE POLICY chains_teacher_select
  ON public.chains
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.nurseries n
      WHERE n.id = public.current_user_nursery_id()
        AND n.chain_id = chains.id
    )
  );

CREATE POLICY chains_parent_deny
  ON public.chains
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND FALSE
  );

-- =============================================================================
-- RLS policies — nurseries
-- =============================================================================
CREATE POLICY nurseries_xo_super_admin_all
  ON public.nurseries
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY nurseries_chain_super_admin_all
  ON public.nurseries
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND chain_id = public.current_user_chain_id()
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND chain_id = public.current_user_chain_id()
  );

CREATE POLICY nurseries_branch_admin_all
  ON public.nurseries
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND id = public.current_user_nursery_id()
  );

CREATE POLICY nurseries_teacher_select
  ON public.nurseries
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND id = public.current_user_nursery_id()
  );

CREATE POLICY nurseries_parent_select
  ON public.nurseries
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = nurseries.id
    )
  );

-- =============================================================================
-- RLS policies — users
-- =============================================================================
CREATE POLICY users_xo_super_admin_all
  ON public.users
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY users_chain_super_admin_select
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND (
      nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      OR chain_id = public.current_user_chain_id()
    )
  );

CREATE POLICY users_chain_super_admin_modify
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY users_chain_super_admin_update
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY users_chain_super_admin_delete
  ON public.users
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY users_branch_admin_all
  ON public.users
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY users_teacher_select
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY users_teacher_update_self
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND id = auth.uid()
  );

CREATE POLICY users_parent_select_self
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND id = auth.uid()
  );

CREATE POLICY users_parent_update_self
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND id = auth.uid()
  );

CREATE POLICY users_self_insert_bootstrap
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY users_self_select
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- =============================================================================
-- RLS policies — classes
-- =============================================================================
CREATE POLICY classes_xo_super_admin_all
  ON public.classes
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY classes_chain_super_admin_all
  ON public.classes
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY classes_branch_admin_all
  ON public.classes
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY classes_teacher_select
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY classes_teacher_update_assigned
  ON public.classes
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND teacher_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND teacher_id = auth.uid()
  );

CREATE POLICY classes_parent_select
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.class_id = classes.id
    )
  );

-- =============================================================================
-- RLS policies — children
-- =============================================================================
CREATE POLICY children_xo_super_admin_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY children_chain_super_admin_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY children_branch_admin_all
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY children_teacher_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND (
      class_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.classes cl
        WHERE cl.id = children.class_id
          AND cl.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY children_teacher_update_assigned
  ON public.children
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND class_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.classes cl
      WHERE cl.id = children.class_id
        AND cl.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND class_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.classes cl
      WHERE cl.id = children.class_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY children_parent_select
  ON public.children
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(children.id)
  );

-- =============================================================================
-- RLS policies — parent_children
-- =============================================================================
CREATE POLICY parent_children_xo_super_admin_all
  ON public.parent_children
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY parent_children_chain_super_admin_all
  ON public.parent_children
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = parent_children.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = parent_children.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY parent_children_branch_admin_all
  ON public.parent_children
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = parent_children.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = parent_children.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY parent_children_teacher_select
  ON public.parent_children
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = parent_children.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY parent_children_parent_select
  ON public.parent_children
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

-- =============================================================================
-- RLS policies — staff
-- =============================================================================
CREATE POLICY staff_xo_super_admin_all
  ON public.staff
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY staff_chain_super_admin_all
  ON public.staff
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY staff_branch_admin_all
  ON public.staff
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY staff_teacher_select_self
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
  );

CREATE POLICY staff_parent_deny
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND FALSE
  );

-- =============================================================================
-- RLS policies — authorized_pickups
-- =============================================================================
CREATE POLICY pickups_xo_super_admin_all
  ON public.authorized_pickups
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY pickups_chain_super_admin_all
  ON public.authorized_pickups
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = authorized_pickups.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = authorized_pickups.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY pickups_branch_admin_all
  ON public.authorized_pickups
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = authorized_pickups.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = authorized_pickups.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY pickups_teacher_select
  ON public.authorized_pickups
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = authorized_pickups.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY pickups_parent_select
  ON public.authorized_pickups
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(authorized_pickups.child_id)
  );

-- =============================================================================
-- RLS policies — academic_calendars
-- =============================================================================
CREATE POLICY calendars_xo_super_admin_all
  ON public.academic_calendars
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY calendars_chain_super_admin_all
  ON public.academic_calendars
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY calendars_branch_admin_all
  ON public.academic_calendars
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY calendars_teacher_select
  ON public.academic_calendars
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY calendars_parent_select
  ON public.academic_calendars
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = academic_calendars.nursery_id
    )
  );

-- =============================================================================
-- RLS policies — compliance_docs
-- =============================================================================
CREATE POLICY compliance_xo_super_admin_all
  ON public.compliance_docs
  FOR ALL
  TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY compliance_chain_super_admin_all
  ON public.compliance_docs
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY compliance_branch_admin_all
  ON public.compliance_docs
  FOR ALL
  TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY compliance_teacher_select
  ON public.compliance_docs
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY compliance_parent_deny
  ON public.compliance_docs
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND FALSE
  );

COMMIT;
