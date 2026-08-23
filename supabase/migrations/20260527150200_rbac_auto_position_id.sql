-- =============================================================================
-- Migration: 20260527150200_rbac_auto_position_id
--
-- The staff_profiles table has both `position text NOT NULL` (legacy) and
-- the new `position_id uuid` FK from Phase 0. Forms that haven't been updated
-- yet still write only the text key. This trigger derives position_id from
-- position+nursery_id on INSERT or UPDATE, so the sync trigger downstream
-- (trg_sync_user_role_from_position) still fires reliably.
--
-- Resolution order:
--   1. If position_id is already set on the incoming row → leave it.
--   2. Look up a position with the same key scoped to this nursery_id.
--   3. Fall back to a platform-wide seed position (nursery_id IS NULL).
--   4. Otherwise leave position_id NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.derive_position_id_from_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NEW.position_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.position IS NULL OR NEW.position = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_id
    FROM public.positions
    WHERE key = NEW.position
      AND nursery_id = NEW.nursery_id
    LIMIT 1;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.positions
      WHERE key = NEW.position
        AND nursery_id IS NULL
      LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    NEW.position_id := v_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_position_id ON public.staff_profiles;
CREATE TRIGGER trg_derive_position_id
  BEFORE INSERT OR UPDATE OF position, position_id ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_position_id_from_key();
