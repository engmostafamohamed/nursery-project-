-- Migration 047: Media columns/helpers, media RLS, service_role. Prerequisite: 045, 046.
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS child_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS shared_with_parent boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.rls_media_parent_may_view(p_media_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  m RECORD;
  ok_019 boolean;
  ok_003 boolean;
BEGIN
  IF p_media_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT
    m2.status,
    m2.visibility,
    m2.class_id,
    m2.approved,
    m2.shared_with_parent,
    m2.child_ids
  INTO m
  FROM public.media m2
  WHERE m2.id = p_media_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  ok_019 := (m.status IS NOT DISTINCT FROM 'approved');
  ok_003 := (COALESCE(m.approved, false) = true AND COALESCE(m.shared_with_parent, false) = true);
  IF NOT (ok_019 OR ok_003) THEN
    RETURN false;
  END IF;
  IF m.visibility IS NOT NULL THEN
    IF m.visibility = 'all_class'::text THEN
      IF m.class_id IS NULL THEN
        RETURN false;
      END IF;
      RETURN EXISTS (
        SELECT 1
        FROM public.parent_children pc
        INNER JOIN public.children c ON c.id = pc.child_id
        WHERE pc.parent_id = auth.uid()
          AND c.class_id = m.class_id
      );
    END IF;
    IF m.visibility = 'tagged_only'::text THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.media_children mc
        INNER JOIN public.parent_children pc ON pc.child_id = mc.child_id
        WHERE mc.media_id = p_media_id
          AND pc.parent_id = auth.uid()
      );
    END IF;
    IF m.visibility = 'specific_parents'::text THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.media_visibility mv
        WHERE mv.media_id = p_media_id
          AND mv.parent_id = auth.uid()
      );
    END IF;
  END IF;
  IF m.child_ids IS NOT NULL AND COALESCE(array_length(m.child_ids, 1), 0) > 0 THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid()
        AND pc.child_id = ANY (m.child_ids)
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_media_staff_media_row_ok(p_media_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  m_nursery uuid;
  m_uploader uuid;
  r public.user_role;
  u_nursery uuid;
BEGIN
  IF p_media_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery FROM public.users u WHERE u.id = auth.uid();
  SELECT m.nursery_id, m.uploaded_by INTO m_nursery, m_uploader FROM public.media m WHERE m.id = p_media_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF public.rls_staff_manages_nursery(m_nursery) THEN
    RETURN true;
  END IF;
  IF r = 'teacher'::public.user_role
    AND m_uploader IS NOT DISTINCT FROM auth.uid()
    AND m_nursery IS NOT DISTINCT FROM u_nursery THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.rls_media_parent_may_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_media_staff_media_row_ok(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_media_parent_may_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_media_staff_media_row_ok(uuid) TO authenticated, service_role;

CREATE POLICY media_xo_all
  ON public.media FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY media_staff_manage
  ON public.media FOR ALL TO authenticated
  USING (public.rls_staff_manages_nursery(nursery_id))
  WITH CHECK (public.rls_staff_manages_nursery(nursery_id));

CREATE POLICY media_teacher_own
  ON public.media FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND uploaded_by = auth.uid()
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'::public.user_role
    AND uploaded_by = auth.uid()
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY media_parent_select
  ON public.media FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.rls_media_parent_may_view(id)
  );

CREATE POLICY media_children_select
  ON public.media_children FOR SELECT TO authenticated
  USING (
    public.rls_media_staff_media_row_ok(media_id)
    OR (
      public.current_user_role() = 'parent'::public.user_role
      AND public.rls_media_parent_may_view(media_id)
    )
  );

CREATE POLICY media_children_insert
  ON public.media_children FOR INSERT TO authenticated
  WITH CHECK (public.rls_media_staff_media_row_ok(media_id));

CREATE POLICY media_visibility_select
  ON public.media_visibility FOR SELECT TO authenticated
  USING (
    public.rls_media_staff_media_row_ok(media_id)
    OR (
      public.current_user_role() = 'parent'::public.user_role
      AND public.rls_media_parent_may_view(media_id)
    )
  );

CREATE POLICY media_visibility_insert
  ON public.media_visibility FOR INSERT TO authenticated
  WITH CHECK (public.rls_media_staff_media_row_ok(media_id));

DO $$
DECLARE
  t text;
  svc text[] := ARRAY[
    'attendance_records', 'events', 'classes', 'surveys', 'nurseries', 'waitlist',
    'staff_profiles', 'media', 'media_children', 'media_visibility'
  ];
BEGIN
  FOREACH t IN ARRAY svc
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_all',
      t
    );
  END LOOP;
END $$;;
