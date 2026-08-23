-- Pickup identity verification: incidents table + id-photos storage bucket.
-- Lets a teacher/guard reject a pickup attempt and capture an ID photo for audit.

BEGIN;

-- -----------------------------------------------------------------------------
-- pickup_incidents: logged when guard rejects a pickup (mismatch),
-- or when verification fails for any other reason.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pickup_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  qr_token_id uuid REFERENCES public.qr_tokens (id) ON DELETE SET NULL,
  reported_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  reason text NOT NULL,
  note text,
  id_photo_path text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT pickup_incidents_reason_ck CHECK (
    reason IN ('mismatch_photo', 'mismatch_challenge', 'no_id', 'other')
  )
);

CREATE INDEX IF NOT EXISTS idx_pickup_incidents_nursery_id ON public.pickup_incidents (nursery_id);
CREATE INDEX IF NOT EXISTS idx_pickup_incidents_child_id ON public.pickup_incidents (child_id);
CREATE INDEX IF NOT EXISTS idx_pickup_incidents_created_at ON public.pickup_incidents (created_at DESC);

ALTER TABLE public.pickup_incidents ENABLE ROW LEVEL SECURITY;

-- Teachers / admins of the nursery can insert incidents for their nursery's children.
DROP POLICY IF EXISTS pickup_incidents_staff_insert ON public.pickup_incidents;
CREATE POLICY pickup_incidents_staff_insert
  ON public.pickup_incidents FOR INSERT TO authenticated
  WITH CHECK (
    nursery_id = (SELECT nursery_id FROM public.users WHERE id = auth.uid())
    AND public.current_user_role() IN ('teacher', 'branch_admin', 'chain_super_admin')
  );

-- Same group can read incidents for their nursery.
DROP POLICY IF EXISTS pickup_incidents_staff_select ON public.pickup_incidents;
CREATE POLICY pickup_incidents_staff_select
  ON public.pickup_incidents FOR SELECT TO authenticated
  USING (
    public.is_xo_super_admin()
    OR nursery_id = (SELECT nursery_id FROM public.users WHERE id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- pickup-id-photos: private storage bucket for ID photos captured at pickup.
-- Path convention: {nursery_id}/{child_id}/{timestamp}-{random}.jpg
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pickup-id-photos',
  'pickup-id-photos',
  false,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Pickup id photos insert nursery path" ON storage.objects;
CREATE POLICY "Pickup id photos insert nursery path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pickup-id-photos'
    AND (
      public.is_xo_super_admin()
      OR (
        split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
        AND public.current_user_role() IN ('branch_admin', 'teacher', 'chain_super_admin')
      )
    )
  );

DROP POLICY IF EXISTS "Pickup id photos select nursery path" ON storage.objects;
CREATE POLICY "Pickup id photos select nursery path"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pickup-id-photos'
    AND (
      public.is_xo_super_admin()
      OR split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
    )
  );

COMMIT;
