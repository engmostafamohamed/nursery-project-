-- QR tokens (simple opaque tokens; Edge Function inserts via service role)
-- Child profile avatars + public-read storage bucket

CREATE TABLE public.qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT qr_tokens_token_uniq UNIQUE (token)
);

CREATE INDEX idx_qr_tokens_token ON public.qr_tokens (token);
CREATE INDEX idx_qr_tokens_child_id ON public.qr_tokens (child_id);
CREATE INDEX idx_qr_tokens_nursery_id ON public.qr_tokens (nursery_id);

CREATE TRIGGER trg_qr_tokens_updated_at
BEFORE UPDATE ON public.qr_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY qr_tokens_admin_select
  ON public.qr_tokens
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
    AND (
      nursery_id = public.current_user_nursery_id()
      OR public.is_xo_super_admin()
      OR (
        public.current_user_role() = 'chain_super_admin'
        AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      )
    )
  );

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'child-avatars',
  'child-avatars',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Branch admins upload child avatars" ON storage.objects;
DROP POLICY IF EXISTS "Teachers upload child avatars in nursery" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload child avatars" ON storage.objects;
CREATE POLICY "Authenticated upload child avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'child-avatars'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (
        SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id()
      )
    )
    OR (
      split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
      AND public.current_user_role() IN ('branch_admin', 'teacher')
    )
  )
);

DROP POLICY IF EXISTS "Public read child avatars" ON storage.objects;
CREATE POLICY "Public read child avatars"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'child-avatars');

DROP POLICY IF EXISTS "Authenticated update child avatars" ON storage.objects;
CREATE POLICY "Authenticated update child avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'child-avatars'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (
        SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id()
      )
    )
    OR (
      split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
      AND public.current_user_role() IN ('branch_admin', 'teacher')
    )
  )
);

DROP POLICY IF EXISTS "Authenticated delete child avatars" ON storage.objects;
CREATE POLICY "Authenticated delete child avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'child-avatars'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (
        SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id()
      )
    )
    OR (
      split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
      AND public.current_user_role() IN ('branch_admin', 'teacher')
    )
  )
);
