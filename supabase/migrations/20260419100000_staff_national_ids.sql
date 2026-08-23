-- Dedicated table for staff National ID photo records.
-- Previously the ID photo path lived inside staff_profiles.documents_json (JSONB).
-- Splitting it out gives us first-class per-user rows for lookup, verification
-- workflows, and audit — keyed explicitly by the staff user's auth UID.

CREATE TABLE IF NOT EXISTS public.staff_national_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  staff_profile_id uuid REFERENCES public.staff_profiles (id) ON DELETE SET NULL,
  document_path text NOT NULL,
  document_mime text,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- One ID record per user. Re-uploading simply updates document_path.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_national_ids_user
  ON public.staff_national_ids (user_id);

CREATE INDEX IF NOT EXISTS idx_staff_national_ids_nursery
  ON public.staff_national_ids (nursery_id);

CREATE INDEX IF NOT EXISTS idx_staff_national_ids_staff_profile
  ON public.staff_national_ids (staff_profile_id);

DROP TRIGGER IF EXISTS trg_staff_national_ids_updated_at ON public.staff_national_ids;
CREATE TRIGGER trg_staff_national_ids_updated_at
BEFORE UPDATE ON public.staff_national_ids
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.staff_national_ids ENABLE ROW LEVEL SECURITY;

-- Admins manage records scoped to their nursery / chain.
DROP POLICY IF EXISTS staff_national_ids_admin_all ON public.staff_national_ids;
CREATE POLICY staff_national_ids_admin_all
  ON public.staff_national_ids FOR ALL TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'branch_admin'
      AND nursery_id = public.current_user_nursery_id()
    )
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'branch_admin'
      AND nursery_id = public.current_user_nursery_id()
    )
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

-- A staff member can read their own record only.
DROP POLICY IF EXISTS staff_national_ids_self_read ON public.staff_national_ids;
CREATE POLICY staff_national_ids_self_read
  ON public.staff_national_ids FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role bypass for edge functions and ops scripts.
DROP POLICY IF EXISTS staff_national_ids_service_all ON public.staff_national_ids;
CREATE POLICY staff_national_ids_service_all
  ON public.staff_national_ids FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.staff_national_ids IS
  'Uploaded National ID document for each staff user, keyed by user_id.';
COMMENT ON COLUMN public.staff_national_ids.document_path IS
  'Storage path in the staff-documents bucket (not a public URL).';
COMMENT ON COLUMN public.staff_national_ids.verified IS
  'True when an admin has visually confirmed the photo matches the staff profile.';
