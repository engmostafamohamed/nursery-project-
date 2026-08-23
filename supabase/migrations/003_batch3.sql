-- XO Nursery — Batch 3 (10 tables): payments, subscription billing, media, CCTV,
-- chat, broadcasts, surveys, NPS.
-- Requires: 001_foundation.sql + 002_batch2.sql applied.

BEGIN;

-- -----------------------------------------------------------------------------
-- payments (parent invoice settlements)
-- -----------------------------------------------------------------------------
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  method text NOT NULL,
  gateway_ref text,
  status text NOT NULL DEFAULT 'completed',
  paid_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_status_ck CHECK (
    status IN ('pending', 'completed', 'failed', 'refunded')
  )
);

CREATE INDEX idx_payments_invoice_id ON public.payments (invoice_id);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- subscription_invoices (XO billing to nurseries)
-- -----------------------------------------------------------------------------
CREATE TABLE public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_invoices_status_ck CHECK (
    status IN ('pending', 'paid', 'overdue', 'cancelled')
  )
);

CREATE INDEX idx_subscription_invoices_nursery_id ON public.subscription_invoices (nursery_id);

CREATE TRIGGER trg_subscription_invoices_updated_at
BEFORE UPDATE ON public.subscription_invoices
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- media (teacher uploads; admin approves)
-- -----------------------------------------------------------------------------
CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  child_ids uuid[] NOT NULL DEFAULT '{}',
  event_id uuid REFERENCES public.events (id) ON DELETE SET NULL,
  type text NOT NULL,
  url text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  shared_with_parent boolean NOT NULL DEFAULT false,
  rejection_note text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT media_type_ck CHECK (type IN ('photo', 'video'))
);

CREATE INDEX idx_media_nursery_id ON public.media (nursery_id);
CREATE INDEX idx_media_teacher_id ON public.media (teacher_id);
CREATE INDEX idx_media_event_id ON public.media (event_id);
CREATE INDEX idx_media_child_ids ON public.media USING GIN (child_ids);

CREATE TRIGGER trg_media_updated_at
BEFORE UPDATE ON public.media
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- cameras (CCTV registry — stream URLs managed server-side in production)
-- -----------------------------------------------------------------------------
CREATE TABLE public.cameras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  location text,
  stream_url_rtsp text,
  active boolean NOT NULL DEFAULT true,
  class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cameras_nursery_id ON public.cameras (nursery_id);
CREATE INDEX idx_cameras_class_id ON public.cameras (class_id);

CREATE TRIGGER trg_cameras_updated_at
BEFORE UPDATE ON public.cameras
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- camera_access
-- -----------------------------------------------------------------------------
CREATE TABLE public.camera_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id uuid NOT NULL REFERENCES public.cameras (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT camera_access_camera_parent_uniq UNIQUE (camera_id, parent_id)
);

CREATE INDEX idx_camera_access_camera_id ON public.camera_access (camera_id);
CREATE INDEX idx_camera_access_parent_id ON public.camera_access (parent_id);

CREATE TRIGGER trg_camera_access_updated_at
BEFORE UPDATE ON public.camera_access
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.camera_access ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- messages (1:1 chat; conversation_id groups a thread)
-- -----------------------------------------------------------------------------
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  type text NOT NULL DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_type_ck CHECK (type IN ('text', 'image')),
  CONSTRAINT messages_sender_not_receiver_ck CHECK (sender_id <> receiver_id)
);

CREATE INDEX idx_messages_conversation_id ON public.messages (conversation_id);
CREATE INDEX idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX idx_messages_receiver_id ON public.messages (receiver_id);

CREATE TRIGGER trg_messages_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- broadcast_messages
-- -----------------------------------------------------------------------------
CREATE TABLE public.broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  target_role public.user_role NOT NULL,
  content_ar text NOT NULL,
  content_en text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broadcast_messages_nursery_id ON public.broadcast_messages (nursery_id);
CREATE INDEX idx_broadcast_messages_sender_id ON public.broadcast_messages (sender_id);

CREATE TRIGGER trg_broadcast_messages_updated_at
BEFORE UPDATE ON public.broadcast_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- surveys
-- -----------------------------------------------------------------------------
CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  title_en text NOT NULL,
  target_role public.user_role NOT NULL,
  questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_date date,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT surveys_status_ck CHECK (
    status IN ('draft', 'published', 'closed')
  )
);

CREATE INDEX idx_surveys_nursery_id ON public.surveys (nursery_id);

CREATE TRIGGER trg_surveys_updated_at
BEFORE UPDATE ON public.surveys
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- survey_responses
-- -----------------------------------------------------------------------------
CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT survey_responses_survey_user_uniq UNIQUE (survey_id, user_id)
);

CREATE INDEX idx_survey_responses_survey_id ON public.survey_responses (survey_id);
CREATE INDEX idx_survey_responses_user_id ON public.survey_responses (user_id);

CREATE TRIGGER trg_survey_responses_updated_at
BEFORE UPDATE ON public.survey_responses
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- nps_ratings
-- -----------------------------------------------------------------------------
CREATE TABLE public.nps_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  score smallint NOT NULL,
  comment text,
  submitted_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT nps_ratings_score_ck CHECK (
    score >= 1
    AND score <= 5
  )
);

CREATE INDEX idx_nps_ratings_nursery_id ON public.nps_ratings (nursery_id);
CREATE INDEX idx_nps_ratings_parent_id ON public.nps_ratings (parent_id);

CREATE TRIGGER trg_nps_ratings_updated_at
BEFORE UPDATE ON public.nps_ratings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nps_ratings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS — payments (scope via invoice)
-- =============================================================================
CREATE POLICY payments_xo_all
  ON public.payments FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY payments_chain_all
  ON public.payments FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY payments_branch_all
  ON public.payments FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY payments_teacher_deny
  ON public.payments FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY payments_parent_select
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = payments.invoice_id
        AND i.parent_id = auth.uid()
    )
  );

-- =============================================================================
-- RLS — subscription_invoices
-- =============================================================================
CREATE POLICY subinv_xo_all
  ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY subinv_chain_all
  ON public.subscription_invoices FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY subinv_branch_all
  ON public.subscription_invoices FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY subinv_teacher_deny
  ON public.subscription_invoices FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY subinv_parent_deny
  ON public.subscription_invoices FOR SELECT TO authenticated
  USING (public.current_user_role() = 'parent' AND FALSE);

-- =============================================================================
-- RLS — media
-- =============================================================================
CREATE POLICY media_xo_all
  ON public.media FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY media_chain_all
  ON public.media FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY media_branch_all
  ON public.media FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY media_teacher_all
  ON public.media FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY media_parent_select
  ON public.media FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND approved = true
    AND shared_with_parent = true
    AND EXISTS (
      SELECT 1
      FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid()
        AND pc.child_id = ANY (media.child_ids)
    )
  );

-- =============================================================================
-- RLS — cameras
-- =============================================================================
CREATE POLICY cameras_xo_all
  ON public.cameras FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY cameras_chain_all
  ON public.cameras FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY cameras_branch_all
  ON public.cameras FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY cameras_teacher_select
  ON public.cameras FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY cameras_parent_select_granted
  ON public.cameras FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.camera_access ca
      WHERE ca.camera_id = cameras.id
        AND ca.parent_id = auth.uid()
        AND ca.active = true
    )
  );

-- =============================================================================
-- RLS — camera_access
-- =============================================================================
CREATE POLICY camacc_xo_all
  ON public.camera_access FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY camacc_chain_all
  ON public.camera_access FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.cameras c
      WHERE c.id = camera_access.camera_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.cameras c
      WHERE c.id = camera_access.camera_id
        AND c.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY camacc_branch_all
  ON public.camera_access FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.cameras c
      WHERE c.id = camera_access.camera_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.cameras c
      WHERE c.id = camera_access.camera_id
        AND c.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY camacc_teacher_deny
  ON public.camera_access FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY camacc_parent_select
  ON public.camera_access FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

-- =============================================================================
-- RLS — messages
-- =============================================================================
CREATE POLICY msg_xo_all
  ON public.messages FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY msg_chain_all
  ON public.messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.users us
      JOIN public.nurseries n ON n.id = us.nursery_id
      WHERE us.id = messages.sender_id
        AND n.chain_id = public.current_user_chain_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.users ur
      JOIN public.nurseries n ON n.id = ur.nursery_id
      WHERE ur.id = messages.receiver_id
        AND n.chain_id = public.current_user_chain_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.users us
      JOIN public.nurseries n ON n.id = us.nursery_id
      WHERE us.id = messages.sender_id
        AND n.chain_id = public.current_user_chain_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.users ur
      JOIN public.nurseries n ON n.id = ur.nursery_id
      WHERE ur.id = messages.receiver_id
        AND n.chain_id = public.current_user_chain_id()
    )
  );

CREATE POLICY msg_branch_all
  ON public.messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.users us
      WHERE us.id = messages.sender_id
        AND us.nursery_id = public.current_user_nursery_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.users ur
      WHERE ur.id = messages.receiver_id
        AND ur.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.users us
      WHERE us.id = messages.sender_id
        AND us.nursery_id = public.current_user_nursery_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.users ur
      WHERE ur.id = messages.receiver_id
        AND ur.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY msg_teacher_participant
  ON public.messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND (
      sender_id = auth.uid()
      OR receiver_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND (
      sender_id = auth.uid()
      OR receiver_id = auth.uid()
    )
  );

CREATE POLICY msg_parent_participant
  ON public.messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND (
      sender_id = auth.uid()
      OR receiver_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND (
      sender_id = auth.uid()
      OR receiver_id = auth.uid()
    )
  );

-- =============================================================================
-- RLS — broadcast_messages
-- =============================================================================
CREATE POLICY bcast_xo_all
  ON public.broadcast_messages FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY bcast_chain_all
  ON public.broadcast_messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY bcast_branch_all
  ON public.broadcast_messages FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY bcast_teacher_select
  ON public.broadcast_messages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND target_role = 'teacher'::public.user_role
  );

CREATE POLICY bcast_parent_select
  ON public.broadcast_messages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND nursery_id IN (
      SELECT DISTINCT
        c.nursery_id
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
    )
    AND target_role = 'parent'::public.user_role
  );

-- =============================================================================
-- RLS — surveys
-- =============================================================================
CREATE POLICY surveys_xo_all
  ON public.surveys FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY surveys_chain_all
  ON public.surveys FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY surveys_branch_all
  ON public.surveys FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY surveys_teacher_select
  ON public.surveys FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND target_role = 'teacher'::public.user_role
    AND status = 'published'
  );

CREATE POLICY surveys_parent_select
  ON public.surveys FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
        AND c.nursery_id = surveys.nursery_id
    )
    AND target_role = 'parent'::public.user_role
    AND status = 'published'
  );

-- =============================================================================
-- RLS — survey_responses
-- =============================================================================
CREATE POLICY sresp_xo_all
  ON public.survey_responses FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY sresp_chain_all
  ON public.survey_responses FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

CREATE POLICY sresp_branch_all
  ON public.survey_responses FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND EXISTS (
      SELECT 1
      FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.nursery_id = public.current_user_nursery_id()
    )
  );

CREATE POLICY sresp_teacher_own
  ON public.survey_responses FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND user_id = auth.uid()
  );

CREATE POLICY sresp_parent_own
  ON public.survey_responses FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND user_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND user_id = auth.uid()
  );

-- =============================================================================
-- RLS — nps_ratings
-- =============================================================================
CREATE POLICY nps_xo_all
  ON public.nps_ratings FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY nps_chain_all
  ON public.nps_ratings FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY nps_branch_all
  ON public.nps_ratings FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY nps_teacher_deny
  ON public.nps_ratings FOR SELECT TO authenticated
  USING (public.current_user_role() = 'teacher' AND FALSE);

CREATE POLICY nps_parent_own
  ON public.nps_ratings FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

COMMIT;
