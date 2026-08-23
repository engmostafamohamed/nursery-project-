-- Pre-live hardening: tenant isolation + storage exposure controls

-- 1) Ensure sensitive core tables keep RLS enabled.
ALTER TABLE IF EXISTS public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.parent_children ENABLE ROW LEVEL SECURITY;

-- 2) Lock down create_event_permissions to prevent cross-tenant misuse.
CREATE OR REPLACE FUNCTION public.create_event_permissions(
  p_event_id uuid,
  p_nursery_id uuid,
  p_target_scope text,
  p_target_class_id uuid DEFAULT NULL,
  p_target_child_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := public.current_user_role();
  v_event_nursery_id uuid;
  v_event_exists boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_role NOT IN ('branch_admin', 'chain_super_admin', 'xo_super_admin') THEN
    RAISE EXCEPTION 'Insufficient role';
  END IF;

  SELECT e.nursery_id, true
  INTO v_event_nursery_id, v_event_exists
  FROM public.events e
  WHERE e.id = p_event_id;

  IF NOT v_event_exists THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_event_nursery_id IS DISTINCT FROM p_nursery_id THEN
    RAISE EXCEPTION 'Event nursery mismatch';
  END IF;

  IF NOT (
    public.is_xo_super_admin()
    OR p_nursery_id = public.current_user_nursery_id()
    OR (
      v_role = 'chain_super_admin'
      AND p_nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  ) THEN
    RAISE EXCEPTION 'Cannot manage another nursery';
  END IF;

  IF p_target_scope = 'all' THEN
    INSERT INTO public.permissions (child_id, event_id, permission_type, status)
    SELECT c.id, p_event_id, 'event', 'pending'
    FROM public.children c
    WHERE c.nursery_id = p_nursery_id
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.permissions p
        WHERE p.child_id = c.id
          AND p.event_id = p_event_id
      );
  ELSIF p_target_scope = 'class' AND p_target_class_id IS NOT NULL THEN
    INSERT INTO public.permissions (child_id, event_id, permission_type, status)
    SELECT c.id, p_event_id, 'event', 'pending'
    FROM public.children c
    WHERE c.class_id = p_target_class_id
      AND c.nursery_id = p_nursery_id
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.permissions p
        WHERE p.child_id = c.id
          AND p.event_id = p_event_id
      );
  ELSIF p_target_scope = 'individual' AND p_target_child_ids IS NOT NULL THEN
    INSERT INTO public.permissions (child_id, event_id, permission_type, status)
    SELECT c.id, p_event_id, 'event', 'pending'
    FROM public.children c
    WHERE c.id = ANY(p_target_child_ids)
      AND c.nursery_id = p_nursery_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.permissions p
        WHERE p.child_id = c.id
          AND p.event_id = p_event_id
      );
  ELSE
    RAISE EXCEPTION 'Invalid target scope';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_permissions(uuid, uuid, text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_event_permissions(uuid, uuid, text, uuid, uuid[]) TO authenticated;

-- 3) Remove public read exposure from child avatars; enforce authenticated, tenant-scoped access.
UPDATE storage.buckets
SET public = false
WHERE id = 'child-avatars';

DROP POLICY IF EXISTS "Public read child avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read child avatars" ON storage.objects;

CREATE POLICY "Authenticated read child avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'child-avatars'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() = 'chain_super_admin'
      AND split_part(name, '/', 1) IN (
        SELECT id::text
        FROM public.nurseries
        WHERE chain_id = public.current_user_chain_id()
      )
    )
    OR (
      split_part(name, '/', 1) = (
        SELECT nursery_id::text
        FROM public.users
        WHERE id = auth.uid()
      )
      AND public.current_user_role() IN ('branch_admin', 'teacher', 'parent')
    )
  )
);
