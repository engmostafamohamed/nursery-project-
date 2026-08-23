-- =====================================================================
-- Onboarding fix migration
-- =====================================================================
-- 1. Allow a freshly-signed-up admin (branch_admin/chain_super_admin)
--    with no nursery_id yet to bootstrap their first nursery.
-- 2. Eliminate cross-table RLS recursion that fired when any branch_admin
--    UPDATE/INSERTed `nurseries` with `RETURNING *` (Supabase
--    `Prefer: return=representation`). The chain went:
--      nurseries SELECT (RETURNING) -> nurseries_parent_select EXISTS
--        on children -> children_chain_super_admin_all JOIN nurseries
--        -> back into nurseries SELECT policies -> ... recursion.
--    Fix: replace inline cross-table EXISTS/JOIN expressions with
--    SECURITY DEFINER helper functions that bypass RLS internally.
-- 3. Drop 5 stale duplicate `children` policies left behind by
--    20260402090500_fix_children_rls_recursion_runtime.sql, which only
--    dropped the new-named policies before recreating them and never
--    removed the legacy ones (children_branch_admin, children_chain_admin,
--    children_parent, children_teacher, children_xo_admin).
-- 4. Create the missing `nursery-logos` storage bucket + policies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Atomic SECURITY DEFINER RPC for first-time onboarding.
--    Direct INSERT via PostgREST is not viable: even with a permissive
--    bootstrap RLS policy the SELECT-after-INSERT (used by the client to
--    read back the new id so it can link the user) fails because no
--    SELECT policy matches a row whose id is not yet equal to the user's
--    nursery_id. Wrapping the insert + user-link in a SECURITY DEFINER
--    RPC sidesteps RLS entirely and is atomic.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS nurseries_self_bootstrap ON public.nurseries;

CREATE OR REPLACE FUNCTION public.bootstrap_nursery_for_current_user(
  p_name_ar       text,
  p_name_en       text,
  p_language_pref text DEFAULT 'both',
  p_city          text DEFAULT NULL,
  p_phone         text DEFAULT NULL,
  p_logo_url      text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_role         public.user_role;
  v_existing_nid uuid;
  v_new_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SET LOCAL row_security = off;

  SELECT u.role, u.nursery_id INTO v_role, v_existing_nid
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42704';
  END IF;

  IF v_role NOT IN ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role) THEN
    RAISE EXCEPTION 'Only nursery admins may bootstrap a nursery' USING ERRCODE = '42501';
  END IF;

  IF v_existing_nid IS NOT NULL THEN
    RAISE EXCEPTION 'User already linked to a nursery' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.nurseries (name_ar, name_en, language_pref, city, phone, logo_url)
  VALUES (
    p_name_ar,
    p_name_en,
    COALESCE(p_language_pref, 'both'),
    p_city,
    p_phone,
    p_logo_url
  )
  RETURNING id INTO v_new_id;

  UPDATE public.users
  SET nursery_id = v_new_id,
      updated_at = now()
  WHERE id = v_uid;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_nursery_for_current_user(text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.bootstrap_nursery_for_current_user(text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. SECURITY DEFINER helpers to break RLS recursion chains
-- ---------------------------------------------------------------------

-- Nursery ids that a parent can see (because at least one of their
-- children belongs to that nursery). Bypasses RLS on children/parent_children.
CREATE OR REPLACE FUNCTION public.parent_accessible_nursery_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT DISTINCT c.nursery_id
  FROM public.children c
  JOIN public.parent_children pc ON pc.child_id = c.id
  WHERE pc.parent_id = auth.uid();
END;
$$;

-- Class ids that a parent can see (because at least one of their
-- children is in that class).
CREATE OR REPLACE FUNCTION public.parent_accessible_class_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT DISTINCT c.class_id
  FROM public.children c
  JOIN public.parent_children pc ON pc.child_id = c.id
  WHERE pc.parent_id = auth.uid()
    AND c.class_id IS NOT NULL;
END;
$$;

-- Class ids assigned to the current teacher (within their nursery).
CREATE OR REPLACE FUNCTION public.teacher_assigned_class_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY
  SELECT cl.id
  FROM public.classes cl
  WHERE cl.teacher_id = auth.uid();
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Rewrite policies that referenced child/nursery tables inline so
--    they go through SECURITY DEFINER helpers instead.
-- ---------------------------------------------------------------------

-- nurseries: parent SELECT
DROP POLICY IF EXISTS nurseries_parent_select ON public.nurseries;
CREATE POLICY nurseries_parent_select ON public.nurseries
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND id IN (SELECT public.parent_accessible_nursery_ids())
  );

-- children: chain_super_admin ALL — replace nurseries JOIN with helper
DROP POLICY IF EXISTS children_chain_super_admin_all ON public.children;
CREATE POLICY children_chain_super_admin_all ON public.children
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

-- children: teacher SELECT — replace classes JOIN with helper
DROP POLICY IF EXISTS children_teacher_select ON public.children;
CREATE POLICY children_teacher_select ON public.children
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
    AND class_id IN (SELECT public.teacher_assigned_class_ids())
  );

-- children: parent SELECT — already uses SECURITY DEFINER
-- parent_can_access_child(); keep as-is.

-- classes: parent SELECT — replace inline join with helper
DROP POLICY IF EXISTS classes_parent_select ON public.classes;
CREATE POLICY classes_parent_select ON public.classes
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND id IN (SELECT public.parent_accessible_class_ids())
  );

-- ---------------------------------------------------------------------
-- 3b. Make the create_default_nursery_settings() trigger SECURITY DEFINER.
--     Otherwise it runs as the inserting user and tries to INSERT into
--     `nursery_settings`, which has no INSERT policy — so the trigger
--     fails and the entire nursery INSERT is rolled back, surfacing as
--     a misleading 42501 RLS error on `nurseries`.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_default_nursery_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.nursery_settings (nursery_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Drop stale duplicate `children` policies left over from before the
--    recursion-fix migration.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS children_branch_admin ON public.children;
DROP POLICY IF EXISTS children_chain_admin  ON public.children;
DROP POLICY IF EXISTS children_parent       ON public.children;
DROP POLICY IF EXISTS children_teacher      ON public.children;
DROP POLICY IF EXISTS children_xo_admin     ON public.children;

-- ---------------------------------------------------------------------
-- 5. nursery-logos storage bucket + policies (public read, owner write)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nursery-logos',
  'nursery-logos',
  true,
  5 * 1024 * 1024,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "nursery_logos_public_read" ON storage.objects;
CREATE POLICY "nursery_logos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'nursery-logos');

DROP POLICY IF EXISTS "nursery_logos_authenticated_insert_own_folder" ON storage.objects;
CREATE POLICY "nursery_logos_authenticated_insert_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'nursery-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "nursery_logos_authenticated_update_own_folder" ON storage.objects;
CREATE POLICY "nursery_logos_authenticated_update_own_folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'nursery-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'nursery-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "nursery_logos_authenticated_delete_own_folder" ON storage.objects;
CREATE POLICY "nursery_logos_authenticated_delete_own_folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'nursery-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
