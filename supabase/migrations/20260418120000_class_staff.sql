-- Task #11: Class management with lead teacher and assistants.
-- Introduces a `class_staff` join table so each class can have one `lead`
-- teacher plus zero or more `assistant` teachers. Backfills from the existing
-- `classes.teacher_id` column (kept as a denormalized convenience for one
-- release; new code reads from `class_staff`).

BEGIN;

-- 1. Role enum (lead | assistant).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_staff_role') THEN
    CREATE TYPE public.class_staff_role AS ENUM ('lead', 'assistant');
  END IF;
END
$$;

-- 2. Join table.
CREATE TABLE IF NOT EXISTS public.class_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.class_staff_role NOT NULL DEFAULT 'assistant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_staff_class_user_unique UNIQUE (class_id, user_id)
);

-- One lead per class (allow many assistants).
CREATE UNIQUE INDEX IF NOT EXISTS class_staff_one_lead_per_class
  ON public.class_staff (class_id)
  WHERE role = 'lead';

CREATE INDEX IF NOT EXISTS class_staff_user_idx ON public.class_staff (user_id);
CREATE INDEX IF NOT EXISTS class_staff_class_idx ON public.class_staff (class_id);

COMMENT ON TABLE public.class_staff IS
  'Membership of staff (teacher role) on a class. role=lead is the primary teacher; role=assistant is a co-teacher / nanny / aide.';
COMMENT ON COLUMN public.classes.teacher_id IS
  'Deprecated: use class_staff with role=lead. Kept in sync via trigger for one release for legacy reads.';

-- 3. Backfill: every existing classes.teacher_id becomes a lead row.
INSERT INTO public.class_staff (class_id, user_id, role)
SELECT c.id, c.teacher_id, 'lead'::public.class_staff_role
  FROM public.classes c
 WHERE c.teacher_id IS NOT NULL
ON CONFLICT (class_id, user_id) DO NOTHING;

-- 4. Trigger: keep classes.teacher_id in sync with the lead row so legacy
--    reads continue to work until they're migrated.
CREATE OR REPLACE FUNCTION public.sync_classes_lead_teacher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class uuid;
  v_lead uuid;
BEGIN
  v_class := COALESCE(NEW.class_id, OLD.class_id);
  SELECT user_id INTO v_lead
    FROM public.class_staff
   WHERE class_id = v_class AND role = 'lead'
   LIMIT 1;
  UPDATE public.classes SET teacher_id = v_lead, updated_at = now()
   WHERE id = v_class AND COALESCE(teacher_id, '00000000-0000-0000-0000-000000000000'::uuid)
                       IS DISTINCT FROM COALESCE(v_lead, '00000000-0000-0000-0000-000000000000'::uuid);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS class_staff_sync_lead ON public.class_staff;
CREATE TRIGGER class_staff_sync_lead
AFTER INSERT OR UPDATE OR DELETE ON public.class_staff
FOR EACH ROW EXECUTE FUNCTION public.sync_classes_lead_teacher();

-- 5. RLS.
ALTER TABLE public.class_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_staff_xo_all ON public.class_staff;
CREATE POLICY class_staff_xo_all
  ON public.class_staff FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

DROP POLICY IF EXISTS class_staff_chain_admin_all ON public.class_staff;
CREATE POLICY class_staff_chain_admin_all
  ON public.class_staff FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND class_id IN (
      SELECT id FROM public.classes
       WHERE nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'::public.user_role
    AND class_id IN (
      SELECT id FROM public.classes
       WHERE nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
    )
  );

DROP POLICY IF EXISTS class_staff_branch_admin_all ON public.class_staff;
CREATE POLICY class_staff_branch_admin_all
  ON public.class_staff FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND class_id IN (
      SELECT id FROM public.classes
       WHERE nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'::public.user_role
    AND class_id IN (
      SELECT id FROM public.classes
       WHERE nursery_id = public.current_user_nursery_id()
    )
  );

DROP POLICY IF EXISTS class_staff_teacher_select ON public.class_staff;
CREATE POLICY class_staff_teacher_select
  ON public.class_staff FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND class_id IN (
      SELECT id FROM public.classes
       WHERE nursery_id = public.current_user_nursery_id()
    )
  );

DROP POLICY IF EXISTS class_staff_parent_select ON public.class_staff;
CREATE POLICY class_staff_parent_select
  ON public.class_staff FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'::public.user_role
    AND public.rls_parent_has_child_in_class(class_id)
  );

-- 6. Replace classes_teacher_update_assigned so it allows updates when the
--    teacher is a member of class_staff (any role), not just the legacy
--    teacher_id field.
DROP POLICY IF EXISTS classes_teacher_update_assigned ON public.classes;
CREATE POLICY classes_teacher_update_assigned
  ON public.classes FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'teacher'::public.user_role
    AND id IN (SELECT class_id FROM public.class_staff WHERE user_id = auth.uid())
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'::public.user_role
    AND id IN (SELECT class_id FROM public.class_staff WHERE user_id = auth.uid())
  );

COMMIT;
