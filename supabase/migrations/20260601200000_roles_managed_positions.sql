-- =============================================================================
-- Migration: 20260601200000_roles_managed_positions
--
-- Adds the hierarchy-based position-visibility column to public.roles.
--   managed_position_keys text[]:
--     NULL  -> the role manages ALL positions (i.e. no filter; the existing
--              role/nursery RLS still applies, but the React UI no longer
--              hides anything by position)
--     []    -> the role manages NO positions (won't see anyone in the staff
--              list and the position dropdown is empty)
--     [...] -> the role manages exactly these position keys
--
-- The column references positions.key by string. No FK — positions can be
-- renamed/deleted without breaking the role's intent.
--
-- The filter is applied client-side in:
--   - src/features/staff-onboarding/StaffOnboardingStepPanels.tsx  (dropdown)
--   - src/pages/admin/AdminStaffDirectoryPage.tsx                 (list rows)
-- =============================================================================

BEGIN;

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS managed_position_keys text[] NULL;

COMMENT ON COLUMN public.roles.managed_position_keys IS
  'Position keys this role can manage. NULL = manage all; empty array = manage none.';

-- Seed backfill —
--   Super Admin, Chain Admin, Branch Admin, Manager Operations -> manage all (NULL)
--   Manager HR  -> all 8 non-manager positions
--   Manager Fin -> admin only (typical finance-clerical scope)
--   Manager Teacher (custom) -> teaching-tier positions
--   Teacher, Parent -> empty (they don't reach staff pages, but explicit)

UPDATE public.roles SET managed_position_keys = NULL
  WHERE key IN ('super_admin','chain_admin','branch_admin','manager_operations');

UPDATE public.roles
  SET managed_position_keys =
      ARRAY['teacher','assistant','nanny','driver','kitchen','cleaner','security','admin']
  WHERE key = 'manager_hr';

UPDATE public.roles
  SET managed_position_keys = ARRAY['admin']
  WHERE key = 'manager_finance';

UPDATE public.roles
  SET managed_position_keys = ARRAY['teacher','assistant','nanny']
  WHERE key = 'manager_teacher';

UPDATE public.roles
  SET managed_position_keys = ARRAY[]::text[]
  WHERE key IN ('teacher','parent');

COMMIT;
