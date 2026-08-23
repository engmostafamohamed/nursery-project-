-- Migration 048: Change all STABLE helper functions to VOLATILE
-- This fixes "SET is not allowed in a non-volatile function" error

-- From Migration 045 - change to VOLATILE
CREATE OR REPLACE FUNCTION public.rls_staff_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
AS $$
DECLARE
  c_nursery uuid;
  u_role public.user_role;
  u_nursery uuid;
  u_chain uuid;
BEGIN
  IF p_child_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT role, nursery_id, chain_id INTO u_role, u_nursery, u_chain FROM public.users WHERE id = auth.uid();
  SELECT nursery_id INTO c_nursery FROM public.children WHERE id = p_child_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF u_role = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF u_role = 'chain_super_admin'::public.user_role THEN
    RETURN c_nursery IN (
      SELECT n.id FROM public.nurseries n WHERE n.chain_id = u_chain
    );
  END IF;
  IF u_role = 'branch_admin'::public.user_role OR u_role = 'teacher'::public.user_role THEN
    RETURN c_nursery IS NOT DISTINCT FROM u_nursery;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_parent_has_child_in_nursery(p_nursery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
AS $$
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.parent_children pc
    INNER JOIN public.children c ON c.id = pc.child_id
    WHERE pc.parent_id = auth.uid()
      AND c.nursery_id = p_nursery_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_parent_has_child_in_class(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
AS $$
BEGIN
  IF p_class_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  RETURN EXISTS (
    SELECT 1
    FROM public.parent_children pc
    INNER JOIN public.children c ON c.id = pc.child_id
    WHERE pc.parent_id = auth.uid()
      AND c.class_id = p_class_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_staff_manages_nursery(p_nursery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
AS $$
DECLARE
  u_role public.user_role;
  u_nursery uuid;
  u_chain uuid;
  n_chain uuid;
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT role, nursery_id, chain_id INTO u_role, u_nursery, u_chain FROM public.users WHERE id = auth.uid();
  IF u_role = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF u_role = 'chain_super_admin'::public.user_role THEN
    SELECT chain_id INTO n_chain FROM public.nurseries WHERE id = p_nursery_id;
    RETURN n_chain IS NOT DISTINCT FROM u_chain;
  END IF;
  IF u_role = 'branch_admin'::public.user_role THEN
    RETURN p_nursery_id IS NOT DISTINCT FROM u_nursery;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_authenticated_staff_sees_nursery(p_nursery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
AS $$
DECLARE
  u_role public.user_role;
  u_nursery uuid;
  u_chain uuid;
  n_chain uuid;
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT role, nursery_id, chain_id INTO u_role, u_nursery, u_chain FROM public.users WHERE id = auth.uid();
  IF u_role = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF u_role = 'chain_super_admin'::public.user_role THEN
    SELECT chain_id INTO n_chain FROM public.nurseries WHERE id = p_nursery_id;
    RETURN n_chain IS NOT DISTINCT FROM u_chain;
  END IF;
  IF u_role = 'branch_admin'::public.user_role OR u_role = 'teacher'::public.user_role THEN
    RETURN p_nursery_id IS NOT DISTINCT FROM u_nursery;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_event_attendees_row_ok(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
AS $$
DECLARE
  ev_nursery uuid;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT nursery_id INTO ev_nursery FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.rls_authenticated_staff_sees_nursery(ev_nursery);
END;
$$;

-- From Migration 047 - change to VOLATILE
CREATE OR REPLACE FUNCTION public.rls_media_parent_may_view(p_media_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
VOLATILE  -- Changed from STABLE
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
VOLATILE  -- Changed from STABLE
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
$$;;
