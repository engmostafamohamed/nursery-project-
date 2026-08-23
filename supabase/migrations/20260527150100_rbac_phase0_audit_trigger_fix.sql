-- =============================================================================
-- Migration: 20260527150100_rbac_phase0_audit_trigger_fix
--
-- Phase 0 added a sync trigger that updates users.role/role_id when
-- staff_profiles.position_id changes. That UPDATE chains into the existing
-- log_user_role_change() audit trigger, which insists changed_by IS NOT NULL.
-- When the sync runs in a context where auth.uid() is null (Management API
-- maintenance, ops scripts, system jobs), the insert into user_role_changes
-- fails with 23502.
--
-- Fix: when no actor is set, fall back to the affected user as changed_by
-- (the audit row still records who was changed, and the reason flags the
-- system-initiated nature).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.user_role_changes (user_id, changed_by, old_role, new_role, reason)
    VALUES (
      NEW.id,
      COALESCE(auth.uid(), NEW.id),
      OLD.role,
      NEW.role,
      CASE WHEN auth.uid() IS NULL
        THEN 'System (no actor) — likely a position-sync or maintenance script'
        ELSE 'Role changed via system'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;
