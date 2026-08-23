-- =============================================================================
-- Event check-in QR codes.
--
-- Extends qr_tokens with an 'event' purpose (a per-child QR shown to the parent
-- on the event page, scanned by staff at the door) and adds an event_attendance
-- table recording each check-in. Writes to both tables happen via the service
-- role inside edge functions (event-qr-issue / qr-verify); the RLS policies here
-- only grant the READS the UI needs.
-- =============================================================================

BEGIN;

-- 1. qr_tokens: event support ------------------------------------------------
ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events (id) ON DELETE CASCADE;

ALTER TABLE public.qr_tokens
  DROP CONSTRAINT IF EXISTS qr_tokens_purpose_check;
ALTER TABLE public.qr_tokens
  ADD CONSTRAINT qr_tokens_purpose_check CHECK (purpose IN ('parent', 'delegate', 'event'));

-- One event QR per (event, child).
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_tokens_event_child
  ON public.qr_tokens (event_id, child_id)
  WHERE purpose = 'event';

COMMENT ON COLUMN public.qr_tokens.event_id IS
  'Set when purpose=event: the event this check-in QR belongs to.';

-- Parents may read their own child''s event QR token, but ONLY after they have
-- granted the event permission (the QR is "sent" once they accept). Admins
-- already have a SELECT policy via qr_tokens_admin_select. Permissive policies
-- are OR-ed. The permissions subquery does not reference qr_tokens, so there is
-- no policy recursion.
DROP POLICY IF EXISTS qr_tokens_parent_event_select ON public.qr_tokens;
CREATE POLICY qr_tokens_parent_event_select
  ON public.qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND purpose = 'event'
    AND child_id IN (
      SELECT pc.child_id FROM public.parent_children pc WHERE pc.parent_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.permissions pm
      WHERE pm.event_id = qr_tokens.event_id
        AND pm.child_id = qr_tokens.child_id
        AND pm.status = 'granted'
    )
  );

-- Pre-existing broad parent read policies (049 / 20260328125538) let a parent
-- read ANY of their child''s qr_tokens, which would expose event QRs before the
-- parent accepts. Narrow them to pickup purposes only; event tokens are then
-- governed solely by qr_tokens_parent_event_select above (granted-gated).
DROP POLICY IF EXISTS parents_can_read_qr_tokens_for_their_children ON public.qr_tokens;
CREATE POLICY parents_can_read_qr_tokens_for_their_children
  ON public.qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    purpose <> 'event'
    AND EXISTS (
      SELECT 1 FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid() AND pc.child_id = qr_tokens.child_id
    )
  );

DROP POLICY IF EXISTS qr_tokens_parent_select ON public.qr_tokens;
CREATE POLICY qr_tokens_parent_select
  ON public.qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND purpose <> 'event'
    AND EXISTS (
      SELECT 1 FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid() AND pc.child_id = qr_tokens.child_id
    )
  );

-- 2. event_attendance --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  checked_in_at timestamptz NOT NULL DEFAULT NOW(),
  checked_in_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT event_attendance_event_child_uniq UNIQUE (event_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_event_id ON public.event_attendance (event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_child_id ON public.event_attendance (child_id);

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

-- Staff of the nursery can read attendance (writes go through service role).
DROP POLICY IF EXISTS event_attendance_staff_select ON public.event_attendance;
CREATE POLICY event_attendance_staff_select
  ON public.event_attendance
  FOR SELECT
  TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() IN ('branch_admin', 'manager', 'teacher')
      AND nursery_id = public.current_user_nursery_id()
    )
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

-- Parents can read their own child''s check-in rows.
DROP POLICY IF EXISTS event_attendance_parent_select ON public.event_attendance;
CREATE POLICY event_attendance_parent_select
  ON public.event_attendance
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND child_id IN (
      SELECT pc.child_id FROM public.parent_children pc WHERE pc.parent_id = auth.uid()
    )
  );

COMMIT;
