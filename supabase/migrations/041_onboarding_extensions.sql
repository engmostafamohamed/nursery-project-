-- Extended JSON for staff/child onboarding wizards (pairs with app features; migrations 038–040 may exist remotely)
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS hr_extended_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS enrollment_extended_json jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('staff-documents', 'staff-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('staff-photos', 'staff-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('child-documents', 'child-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('authorized-pickup-photos', 'authorized-pickup-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff docs insert nursery path" ON storage.objects;
CREATE POLICY "Staff docs insert nursery path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('staff-documents', 'staff-photos')
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id())
    )
    OR (
      split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
      AND public.current_user_role() IN ('branch_admin', 'teacher')
    )
  )
);

DROP POLICY IF EXISTS "Staff docs select nursery path" ON storage.objects;
CREATE POLICY "Staff docs select nursery path"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('staff-documents', 'staff-photos')
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id())
    )
    OR split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Child docs insert nursery path" ON storage.objects;
CREATE POLICY "Child docs insert nursery path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'child-documents'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id())
    )
    OR (
      split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
      AND public.current_user_role() IN ('branch_admin', 'teacher')
    )
  )
);

DROP POLICY IF EXISTS "Child docs select nursery path" ON storage.objects;
CREATE POLICY "Child docs select nursery path"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'child-documents'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id())
    )
    OR split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Pickup photos insert nursery path" ON storage.objects;
CREATE POLICY "Pickup photos insert nursery path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'authorized-pickup-photos'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id())
    )
    OR (
      split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
      AND public.current_user_role() IN ('branch_admin', 'teacher')
    )
  )
);

DROP POLICY IF EXISTS "Pickup photos select nursery path" ON storage.objects;
CREATE POLICY "Pickup photos select nursery path"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'authorized-pickup-photos'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (SELECT id::text FROM public.nurseries WHERE chain_id = public.current_user_chain_id())
    )
    OR split_part(name, '/', 1) = (SELECT nursery_id::text FROM public.users WHERE id = auth.uid())
  )
);
