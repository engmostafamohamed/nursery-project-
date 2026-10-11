CREATE OR REPLACE FUNCTION public.prevent_test_payment_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_is_test boolean;
  new_is_test boolean;
BEGIN
  old_is_test := COALESCE(OLD.notes, '') LIKE '[TEST PAYMENT]%';
  new_is_test := COALESCE(NEW.notes, '') LIKE '[TEST PAYMENT]%';

  IF NEW.status = 'confirmed' AND (old_is_test OR new_is_test) THEN
    RAISE EXCEPTION 'test_payment_cannot_be_confirmed';
  END IF;

  IF old_is_test AND NOT new_is_test THEN
    RAISE EXCEPTION 'test_payment_marker_cannot_be_removed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_attempts_prevent_test_confirmation
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_test_payment_confirmation();
