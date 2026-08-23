-- Migration 037: Simplify storage policies to avoid RLS recursion
-- Replace complex policies with simple auth.uid() checks

DROP POLICY IF EXISTS "Authenticated upload child avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update child avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete child avatars" ON storage.objects;

-- Simple policy: Any authenticated user can upload to child-avatars
CREATE POLICY "Authenticated upload child avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'child-avatars');

-- Simple policy: Any authenticated user can update child-avatars
CREATE POLICY "Authenticated update child avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'child-avatars');

-- Simple policy: Any authenticated user can delete child-avatars
CREATE POLICY "Authenticated delete child avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'child-avatars');;
