-- Child medical health profiles, allergies, conditions, medications, vaccinations,
-- alert dismissals, update requests, and document metadata. RLS scoped by nursery_id + child access.

BEGIN;

-- -----------------------------------------------------------------------------
-- child_health_records (one row per child)
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  blood_type text,
  pediatrician_name text,
  pediatrician_phone text,
  pediatrician_clinic text,
  emergency_contact_name text,
  emergency_contact_phone text,
  insurance_provider text,
  insurance_policy_number text,
  insurance_notes text,
  medical_documents_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT child_health_records_child_uniq UNIQUE (child_id)
);

CREATE INDEX idx_child_health_records_nursery_id ON public.child_health_records (nursery_id);
CREATE INDEX idx_child_health_records_child_id ON public.child_health_records (child_id);

CREATE TRIGGER trg_child_health_records_updated_at
BEFORE UPDATE ON public.child_health_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_health_records ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- child_allergies
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  allergen_name text NOT NULL,
  reaction_type text,
  severity text NOT NULL DEFAULT 'mild',
  treatment_protocol text,
  last_reaction_date date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT child_allergies_severity_ck CHECK (
    severity IN ('mild', 'moderate', 'severe', 'life_threatening')
  )
);

CREATE INDEX idx_child_allergies_nursery_id ON public.child_allergies (nursery_id);
CREATE INDEX idx_child_allergies_child_id ON public.child_allergies (child_id);

CREATE TRIGGER trg_child_allergies_updated_at
BEFORE UPDATE ON public.child_allergies
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_allergies ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- child_chronic_conditions
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_chronic_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  condition_name text NOT NULL,
  diagnosis_date date,
  severity text,
  treatment_protocol text,
  trigger_factors text,
  emergency_response_plan text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_child_chronic_conditions_nursery_id ON public.child_chronic_conditions (nursery_id);
CREATE INDEX idx_child_chronic_conditions_child_id ON public.child_chronic_conditions (child_id);

CREATE TRIGGER trg_child_chronic_conditions_updated_at
BEFORE UPDATE ON public.child_chronic_conditions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_chronic_conditions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- child_medications
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text,
  administration_times text,
  administration_method text NOT NULL DEFAULT 'oral',
  storage_requirements text,
  expiry_date date,
  parent_consent_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT child_medications_method_ck CHECK (
    administration_method IN ('oral', 'inhaler', 'injection', 'topical')
  ),
  CONSTRAINT child_medications_consent_ck CHECK (
    parent_consent_status IN ('pending', 'granted', 'denied')
  )
);

CREATE INDEX idx_child_medications_nursery_id ON public.child_medications (nursery_id);
CREATE INDEX idx_child_medications_child_id ON public.child_medications (child_id);

CREATE TRIGGER trg_child_medications_updated_at
BEFORE UPDATE ON public.child_medications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_medications ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- child_vaccinations
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  vaccine_name text NOT NULL,
  dose_number integer NOT NULL DEFAULT 1,
  date_administered date,
  next_due_date date,
  administered_by text,
  batch_number text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_child_vaccinations_nursery_id ON public.child_vaccinations (nursery_id);
CREATE INDEX idx_child_vaccinations_child_id ON public.child_vaccinations (child_id);

CREATE TRIGGER trg_child_vaccinations_updated_at
BEFORE UPDATE ON public.child_vaccinations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_vaccinations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- child_health_alert_dismissals (admin "resolved" for dashboard)
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_health_alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  alert_fingerprint text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT NOW(),
  dismissed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT child_health_alert_dismissals_uniq UNIQUE (nursery_id, child_id, alert_fingerprint)
);

CREATE INDEX idx_child_health_alert_dismissals_nursery_id ON public.child_health_alert_dismissals (nursery_id);

CREATE TRIGGER trg_child_health_alert_dismissals_updated_at
BEFORE UPDATE ON public.child_health_alert_dismissals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_health_alert_dismissals ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- child_health_update_requests (parent asks admin to review)
-- -----------------------------------------------------------------------------
CREATE TABLE public.child_health_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT child_health_update_requests_status_ck CHECK (status IN ('pending', 'done', 'dismissed'))
);

CREATE INDEX idx_child_health_update_requests_nursery_id ON public.child_health_update_requests (nursery_id);
CREATE INDEX idx_child_health_update_requests_child_id ON public.child_health_update_requests (child_id);

CREATE TRIGGER trg_child_health_update_requests_updated_at
BEFORE UPDATE ON public.child_health_update_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_health_update_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS — child_health_records (and same pattern for child tables via child access)
-- =============================================================================

CREATE POLICY child_health_records_xo_all
  ON public.child_health_records FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_health_records_chain_all
  ON public.child_health_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_health_records_branch_all
  ON public.child_health_records FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_health_records_teacher_select
  ON public.child_health_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = child_health_records.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY child_health_records_parent_select
  ON public.child_health_records FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_health_records.child_id)
  );

-- =============================================================================
-- RLS — child_allergies
-- =============================================================================

CREATE POLICY child_allergies_xo_all
  ON public.child_allergies FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_allergies_chain_all
  ON public.child_allergies FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_allergies_branch_all
  ON public.child_allergies FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_allergies_teacher_select
  ON public.child_allergies FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = child_allergies.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY child_allergies_parent_select
  ON public.child_allergies FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_allergies.child_id)
  );

-- =============================================================================
-- RLS — child_chronic_conditions (same policies)
-- =============================================================================

CREATE POLICY child_chronic_xo_all
  ON public.child_chronic_conditions FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_chronic_chain_all
  ON public.child_chronic_conditions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_chronic_branch_all
  ON public.child_chronic_conditions FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_chronic_teacher_select
  ON public.child_chronic_conditions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = child_chronic_conditions.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY child_chronic_parent_select
  ON public.child_chronic_conditions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_chronic_conditions.child_id)
  );

-- =============================================================================
-- RLS — child_medications
-- =============================================================================

CREATE POLICY child_medications_xo_all
  ON public.child_medications FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_medications_chain_all
  ON public.child_medications FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_medications_branch_all
  ON public.child_medications FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_medications_teacher_select
  ON public.child_medications FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = child_medications.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY child_medications_parent_select
  ON public.child_medications FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_medications.child_id)
  );

-- =============================================================================
-- RLS — child_vaccinations
-- =============================================================================

CREATE POLICY child_vaccinations_xo_all
  ON public.child_vaccinations FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_vaccinations_chain_all
  ON public.child_vaccinations FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_vaccinations_branch_all
  ON public.child_vaccinations FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_vaccinations_teacher_select
  ON public.child_vaccinations FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = child_vaccinations.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY child_vaccinations_parent_select
  ON public.child_vaccinations FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_vaccinations.child_id)
  );

-- =============================================================================
-- RLS — child_health_alert_dismissals (admin only + parent none)
-- =============================================================================

CREATE POLICY child_health_dismissals_xo_all
  ON public.child_health_alert_dismissals FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_health_dismissals_chain_all
  ON public.child_health_alert_dismissals FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_health_dismissals_branch_all
  ON public.child_health_alert_dismissals FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

-- =============================================================================
-- RLS — child_health_update_requests
-- =============================================================================

CREATE POLICY child_health_requests_xo_all
  ON public.child_health_update_requests FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_health_requests_chain_all
  ON public.child_health_update_requests FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_health_requests_branch_all
  ON public.child_health_update_requests FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_health_requests_parent_insert
  ON public.child_health_update_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
    AND public.parent_can_access_child(child_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id AND c.nursery_id = nursery_id
    )
  );

CREATE POLICY child_health_requests_parent_select
  ON public.child_health_update_requests FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
    AND public.parent_can_access_child(child_id)
  );

COMMIT;
