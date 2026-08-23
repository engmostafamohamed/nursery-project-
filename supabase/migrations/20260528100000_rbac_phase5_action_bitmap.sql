-- =============================================================================
-- Migration: 20260528100000_rbac_phase5_action_bitmap
--
-- Adds CRUD-action granularity to role_features. Today `access` is one of
-- {full, with_approval} (absent = none) and only answers "may the user enter
-- this feature?". Real UIs need finer control — e.g. "Teacher can SEE the
-- staff list but not Create/Update/Delete".
--
-- Schema:
--   actions text[]            — subset of {view, create, update, delete}
--   requires_approval boolean — actions need sign-off (replaces the special
--                               'with_approval' value of `access`)
--
-- Backfill:
--   access='full'          → actions={view,create,update,delete}, requires_approval=false
--   access='with_approval' → actions={view,create,update,delete}, requires_approval=true
--   (no rows have access='none' — sparse model)
--
-- The `access` column is kept for backwards compatibility. The engine prefers
-- the new columns when present and falls back to `access` otherwise.
-- =============================================================================

BEGIN;

ALTER TABLE public.role_features
  ADD COLUMN IF NOT EXISTS actions text[] NOT NULL
    DEFAULT ARRAY['view','create','update','delete'],
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- Validate: actions must be a subset of the allowed values.
ALTER TABLE public.role_features
  DROP CONSTRAINT IF EXISTS role_features_actions_subset_ck;
ALTER TABLE public.role_features
  ADD CONSTRAINT role_features_actions_subset_ck
    CHECK (actions <@ ARRAY['view','create','update','delete']);

-- Validate: 'view' must be present whenever the row exists (you can't grant
-- create/update/delete without also granting view).
ALTER TABLE public.role_features
  DROP CONSTRAINT IF EXISTS role_features_view_required_ck;
ALTER TABLE public.role_features
  ADD CONSTRAINT role_features_view_required_ck
    CHECK ('view' = ANY(actions));

-- Drop the constraint on `access` so we can leave the existing value alone
-- but also stop requiring future writes to populate it.
ALTER TABLE public.role_features
  DROP CONSTRAINT IF EXISTS role_features_access_ck;

ALTER TABLE public.role_features
  ALTER COLUMN access DROP NOT NULL;

-- Backfill: translate the legacy access values.
UPDATE public.role_features
SET actions = ARRAY['view','create','update','delete'],
    requires_approval = (access = 'with_approval');

-- Re-add a permissive CHECK on `access` so legacy code can still write it
-- if needed.
ALTER TABLE public.role_features
  ADD CONSTRAINT role_features_access_ck
    CHECK (access IS NULL OR access IN ('full','with_approval'));

COMMIT;
