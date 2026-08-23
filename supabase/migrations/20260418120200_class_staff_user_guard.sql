-- Guard: a class_staff row must reference an active `teacher` user that
-- belongs to the same nursery as the class. Enforced as a trigger so we can
-- look across tables (CHECK constraints can't reference other tables).

BEGIN;

CREATE OR REPLACE FUNCTION public.class_staff_validate_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_nursery uuid;
  v_user_nursery uuid;
  v_user_role text;
  v_user_status text;
BEGIN
  SELECT nursery_id INTO v_class_nursery
    FROM public.classes WHERE id = NEW.class_id;
  IF v_class_nursery IS NULL THEN
    RAISE EXCEPTION 'class_staff: class % not found', NEW.class_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT nursery_id, role::text, status::text
    INTO v_user_nursery, v_user_role, v_user_status
    FROM public.users WHERE id = NEW.user_id;
  IF v_user_nursery IS NULL THEN
    RAISE EXCEPTION 'class_staff: user % not found', NEW.user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_user_nursery <> v_class_nursery THEN
    RAISE EXCEPTION 'class_staff: user % belongs to a different nursery than class %',
      NEW.user_id, NEW.class_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_user_role <> 'teacher' THEN
    RAISE EXCEPTION 'class_staff: user % is not a teacher (role=%)',
      NEW.user_id, v_user_role
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_user_status IS NOT NULL AND v_user_status <> 'active' THEN
    RAISE EXCEPTION 'class_staff: user % is not active (status=%)',
      NEW.user_id, v_user_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_staff_validate_user_trg ON public.class_staff;
CREATE TRIGGER class_staff_validate_user_trg
BEFORE INSERT OR UPDATE OF user_id, class_id ON public.class_staff
FOR EACH ROW EXECUTE FUNCTION public.class_staff_validate_user();

COMMIT;
