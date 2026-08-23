-- Atomic helper to swap the lead teacher of a class without leaving the class
-- temporarily lead-less and without violating the one-lead-per-class unique
-- index when the previous lead still exists.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_class_lead(p_class_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    DELETE FROM public.class_staff
     WHERE class_id = p_class_id AND role = 'lead';
    RETURN;
  END IF;

  -- Drop other lead rows for this class first so the partial unique index
  -- (one lead per class) does not block the upsert below.
  DELETE FROM public.class_staff
   WHERE class_id = p_class_id
     AND role = 'lead'
     AND user_id <> p_user_id;

  -- Promote (or insert) this user as lead, in a single statement.
  INSERT INTO public.class_staff (class_id, user_id, role)
       VALUES (p_class_id, p_user_id, 'lead')
  ON CONFLICT (class_id, user_id)
  DO UPDATE SET role = 'lead', updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_class_lead(uuid, uuid) TO authenticated;

COMMIT;
