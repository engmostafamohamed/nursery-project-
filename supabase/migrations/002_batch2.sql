-- XO Nursery — Batch 2 (10 tables): admissions pipeline, attendance, health,
-- milestones, events, permissions, daily reports, parent invoices.
-- Requires: 001_foundation.sql applied (types, set_updated_at, RLS helpers).

BEGIN;

-- -----------------------------------------------------------------------------
-- admissions
-- -----------------------------------------------------------------------------
CREATE TABLE public.admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  inquiry_date date NOT NULL DEFAULT (CURRENT_DATE),
  applicant_name_ar text NOT NULL,
  applicant_name_en text NOT NULL,
  dob date,
  parent_name_ar text NOT NULL,
  parent_name_en text NOT NULL,
  parent_phone text NOT NULL,
  linked_parent_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'inquiry',
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT admissions_status_ck CHECK (
    status IN (
      'inquiry',
      'waitlist',
      'applied',
      'interview',
      'accepted',
      'rejected',
      'enrolled'
    )
  )
);

CREATE INDEX idx_admissions_nursery_id ON public.admissions (nursery_id);
CREATE INDEX idx_admissions_linked_parent ON public.admissions (linked_parent_user_id);

CREATE TRIGGER trg_admissions_updated_at
BEFORE UPDATE ON public.admissions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- admission_documents
-- -----------------------------------------------------------------------------
CREATE TABLE public.admission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions (id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_url text,
  verified boolean NOT NULL DEFAULT false,
  expiry_date date,
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admission_documents_admission_id ON public.admission_documents (admission_id);

CREATE TRIGGER trg_admission_documents_updated_at
BEFORE UPDATE ON public.admission_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.admission_documents ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- attendance_records
-- -----------------------------------------------------------------------------
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  extra_hours numeric(10, 2),
  pickup_person_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  qr_scan_log jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_records_child_day_uniq UNIQUE (child_id, attendance_date)
);

CREATE INDEX idx_attendance_records_child_id ON public.attendance_records (child_id);
CREATE INDEX idx_attendance_records_date ON public.attendance_records (attendance_date);

CREATE TRIGGER trg_attendance_records_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- staff_attendance
-- -----------------------------------------------------------------------------
CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  work_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_attendance_user_day_uniq UNIQUE (user_id, work_date)
);

CREATE INDEX idx_staff_attendance_nursery_id ON public.staff_attendance (nursery_id);
CREATE INDEX idx_staff_attendance_user_id ON public.staff_attendance (user_id);

CREATE TRIGGER trg_staff_attendance_updated_at
BEFORE UPDATE ON public.staff_attendance
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- health_records
-- -----------------------------------------------------------------------------
CREATE TABLE public.health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_date date NOT NULL,
  notes text,
  file_url text,
  doctor_name text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT health_records_type_ck CHECK (
    record_type IN ('vaccination', 'visit', 'allergy', 'other')
  )
);

CREATE INDEX idx_health_records_child_id ON public.health_records (child_id);

CREATE TRIGGER trg_health_records_updated_at
BEFORE UPDATE ON public.health_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- milestones
-- -----------------------------------------------------------------------------
CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  category text NOT NULL,
  milestone_name_ar text NOT NULL,
  milestone_name_en text NOT NULL,
  achieved_at date NOT NULL,
  teacher_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT milestones_category_ck CHECK (
    category IN ('gross_motor', 'fine_motor', 'language', 'social')
  )
);

CREATE INDEX idx_milestones_child_id ON public.milestones (child_id);
CREATE INDEX idx_milestones_teacher_id ON public.milestones (teacher_id);

CREATE TRIGGER trg_milestones_updated_at
BEFORE UPDATE ON public.milestones
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- events
-- -----------------------------------------------------------------------------
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  description_ar text,
  description_en text,
  starts_at timestamptz NOT NULL,
  location text,
  category text NOT NULL,
  is_paid boolean NOT NULL DEFAULT false,
  price numeric(12, 2),
  target_scope text NOT NULL DEFAULT 'all',
  target_class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT events_category_ck CHECK (
    category IN ('trip', 'activity', 'service', 'doctor_visit')
  ),
  CONSTRAINT events_target_scope_ck CHECK (
    target_scope IN ('all', 'class', 'individual')
  )
);

CREATE INDEX idx_events_nursery_id ON public.events (nursery_id);
CREATE INDEX idx_events_target_class_id ON public.events (target_class_id);

CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- permissions (digital consent / event permissions)
-- -----------------------------------------------------------------------------
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  permission_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  parent_note text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT permissions_status_ck CHECK (
    status IN ('pending', 'granted', 'denied')
  )
);

CREATE INDEX idx_permissions_child_id ON public.permissions (child_id);
CREATE INDEX idx_permissions_event_id ON public.permissions (event_id);

CREATE TRIGGER trg_permissions_updated_at
BEFORE UPDATE ON public.permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- daily_reports
-- -----------------------------------------------------------------------------
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  report_date date NOT NULL,
  teacher_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  breakfast_pct smallint,
  lunch_pct smallint,
  snack_pct smallint,
  nap_minutes integer,
  mood text,
  toilet_count integer,
  activities jsonb,
  teacher_note text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_reports_child_day_uniq UNIQUE (child_id, report_date),
  CONSTRAINT daily_reports_breakfast_pct_ck CHECK (
    breakfast_pct IS NULL
    OR breakfast_pct IN (0, 25, 50, 75, 100)
  ),
  CONSTRAINT daily_reports_lunch_pct_ck CHECK (
    lunch_pct IS NULL
    OR lunch_pct IN (0, 25, 50, 75, 100)
  ),
  CONSTRAINT daily_reports_snack_pct_ck CHECK (
    snack_pct IS NULL
    OR snack_pct IN (0, 25, 50, 75, 100)
  ),
  CONSTRAINT daily_reports_mood_ck CHECK (
    mood IS NULL
    OR mood IN ('happy', 'content', 'tired', 'upset', 'unwell')
  )
);

CREATE INDEX idx_daily_reports_child_id ON public.daily_reports (child_id);
CREATE INDEX idx_daily_reports_teacher_id ON public.daily_reports (teacher_id);

CREATE TRIGGER trg_daily_reports_updated_at
BEFORE UPDATE ON public.daily_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- invoices (parent-facing; payments table in batch 3)
-- -----------------------------------------------------------------------------
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  line_items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_status_ck CHECK (
    status IN ('pending', 'paid', 'overdue', 'cancelled')
  )
);

CREATE INDEX idx_invoices_nursery_id ON public.invoices (nursery_id);
CREATE INDEX idx_invoices_parent_id ON public.invoices (parent_id);

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS — admissions
-- =============================================================================
CREATE POLICY admissions_xo_all
  ON public.admissions FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY admissions_chain_all
  ON public.admissions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY admissions_branch_all
  ON public.admissions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY admissions_teacher_select
  ON public.admissions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY admissions_parent_select_linked
  ON public.admissions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND linked_parent_user_id = auth.uid()
  );

-- =============================================================================
-- RLS — admission_documents (scope via admission.nursery_id)
-- =============================================================================
CREATE POLICY admission_docs_xo_all
  ON public.admission_documents FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY admission_docs_chain_all
  ON public.admission_documents FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.admissions a
      WHERE a.id = admission_documents.admission_id
        AND a.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.admissions a
      WHERE a.id = admission_documents.admission_id
        AND a.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY admission_docs_branch_all
  ON public.admission_documents FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.admissions a
      WHERE a.id = admission_documents.admission_id
        AND a.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.admissions a
      WHERE a.id = admission_documents.admission_id
        AND a.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY admission_docs_teacher_select
  ON public.admission_documents FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.admissions a
      WHERE a.id = admission_documents.admission_id
        AND a.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY admission_docs_parent_select_linked
  ON public.admission_documents FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.admissions a
      WHERE a.id = admission_documents.admission_id
        AND a.linked_parent_user_id = auth.uid()
    )
  );

-- =============================================================================
-- RLS — attendance_records
-- =============================================================================
CREATE POLICY attendance_xo_all
  ON public.attendance_records FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY attendance_chain_all
  ON public.attendance_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = attendance_records.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = attendance_records.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY attendance_branch_all
  ON public.attendance_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = attendance_records.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = attendance_records.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY attendance_teacher_all
  ON public.attendance_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = attendance_records.child_id
        AND cl.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = attendance_records.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY attendance_parent_select
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(attendance_records.child_id)
  );

-- =============================================================================
-- RLS — staff_attendance
-- =============================================================================
CREATE POLICY staff_att_xo_all
  ON public.staff_attendance FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY staff_att_chain_all
  ON public.staff_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY staff_att_branch_all
  ON public.staff_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY staff_att_teacher_self
  ON public.staff_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY staff_att_parent_deny
  ON public.staff_attendance FOR SELECT TO authenticated
  USING (public.current_user_role() = 'parent' AND FALSE);

-- =============================================================================
-- RLS — health_records
-- =============================================================================
CREATE POLICY health_xo_all
  ON public.health_records FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY health_chain_all
  ON public.health_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = health_records.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = health_records.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY health_branch_all
  ON public.health_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = health_records.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = health_records.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY health_teacher_select
  ON public.health_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = health_records.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY health_parent_select
  ON public.health_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(health_records.child_id)
  );

-- =============================================================================
-- RLS — milestones
-- =============================================================================
CREATE POLICY milestones_xo_all
  ON public.milestones FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY milestones_chain_all
  ON public.milestones FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = milestones.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = milestones.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY milestones_branch_all
  ON public.milestones FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = milestones.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = milestones.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY milestones_teacher_all
  ON public.milestones FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = milestones.child_id
        AND cl.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = milestones.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY milestones_parent_select
  ON public.milestones FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(milestones.child_id)
  );

-- =============================================================================
-- RLS — events
-- =============================================================================
CREATE POLICY events_xo_all
  ON public.events FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY events_chain_all
  ON public.events FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY events_branch_all
  ON public.events FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY events_teacher_select
  ON public.events FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY events_parent_select
  ON public.events FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = events.nursery_id
    )
  );

-- =============================================================================
-- RLS — permissions
-- =============================================================================
CREATE POLICY perm_xo_all
  ON public.permissions FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY perm_chain_all
  ON public.permissions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = permissions.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = permissions.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY perm_branch_all
  ON public.permissions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = permissions.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = permissions.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY perm_teacher_select
  ON public.permissions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = permissions.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY perm_parent_all
  ON public.permissions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(permissions.child_id)
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(permissions.child_id)
  );

-- =============================================================================
-- RLS — daily_reports
-- =============================================================================
CREATE POLICY reports_xo_all
  ON public.daily_reports FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY reports_chain_all
  ON public.daily_reports FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = daily_reports.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = daily_reports.child_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY reports_branch_all
  ON public.daily_reports FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = daily_reports.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = daily_reports.child_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY reports_teacher_all
  ON public.daily_reports FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = daily_reports.child_id
        AND cl.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = daily_reports.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY reports_parent_select
  ON public.daily_reports FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(daily_reports.child_id)
  );

-- =============================================================================
-- RLS — invoices
-- =============================================================================
CREATE POLICY invoices_xo_all
  ON public.invoices FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY invoices_chain_all
  ON public.invoices FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY invoices_branch_all
  ON public.invoices FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY invoices_teacher_deny
  ON public.invoices FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY invoices_parent_select
  ON public.invoices FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

COMMIT;
