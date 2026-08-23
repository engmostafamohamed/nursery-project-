-- Migration 045: Core SECURITY DEFINER helpers (see 047 for media helpers). Prerequisite: 031, 044.
CREATE OR REPLACE FUNCTION public.rls_staff_can_access_child(p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  r public.user_role;
  u_nursery uuid;
  c_nursery uuid;
  c_class uuid;
BEGIN
  IF p_child_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery FROM public.users u WHERE u.id = auth.uid();
  IF r IS NULL THEN
    RETURN false;
  END IF;
  IF r = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  SELECT c.nursery_id, c.class_id INTO c_nursery, c_class FROM public.children c WHERE c.id = p_child_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF r = 'chain_super_admin'::public.user_role THEN
    RETURN c_nursery IN (SELECT public.nursery_ids_for_chain_admin());
  END IF;
  IF r = 'branch_admin'::public.user_role THEN
    RETURN c_nursery IS NOT DISTINCT FROM u_nursery;
  END IF;
  IF r = 'teacher'::public.user_role THEN
    IF c_class IS NULL THEN
      RETURN c_nursery IS NOT DISTINCT FROM u_nursery;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.classes cl
      WHERE cl.id = c_class AND cl.teacher_id = auth.uid()
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_parent_has_child_in_nursery(p_nursery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
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
STABLE
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
STABLE
AS $$
DECLARE
  r public.user_role;
  u_nursery uuid;
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery FROM public.users u WHERE u.id = auth.uid();
  IF r IS NULL THEN
    RETURN false;
  END IF;
  IF r = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF r = 'chain_super_admin'::public.user_role THEN
    RETURN p_nursery_id IN (SELECT public.nursery_ids_for_chain_admin());
  END IF;
  IF r = 'branch_admin'::public.user_role THEN
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
STABLE
AS $$
DECLARE
  r public.user_role;
  u_nursery uuid;
BEGIN
  IF p_nursery_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role, u.nursery_id INTO r, u_nursery FROM public.users u WHERE u.id = auth.uid();
  IF r IS NULL THEN
    RETURN false;
  END IF;
  IF r = 'xo_super_admin'::public.user_role THEN
    RETURN true;
  END IF;
  IF r = 'chain_super_admin'::public.user_role THEN
    RETURN p_nursery_id IN (SELECT public.nursery_ids_for_chain_admin());
  END IF;
  IF r IN ('branch_admin'::public.user_role, 'teacher'::public.user_role) THEN
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
STABLE
AS $$
DECLARE
  ev_nursery uuid;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN false;
  END IF;
  SET LOCAL row_security = off;
  SELECT e.nursery_id INTO ev_nursery FROM public.events e WHERE e.id = p_event_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.rls_authenticated_staff_sees_nursery(ev_nursery);
END;
$$;

REVOKE ALL ON FUNCTION public.rls_staff_can_access_child(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_parent_has_child_in_nursery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_parent_has_child_in_class(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_staff_manages_nursery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_authenticated_staff_sees_nursery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_event_attendees_row_ok(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rls_staff_can_access_child(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_parent_has_child_in_nursery(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_parent_has_child_in_class(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_staff_manages_nursery(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_authenticated_staff_sees_nursery(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_event_attendees_row_ok(uuid) TO authenticated, service_role;;
