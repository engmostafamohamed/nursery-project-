-- Task #7: Cherries spreadsheet alignment
-- 1. Backfill the duplicate `school_admissions_plan` typo column into the
--    canonical `school_admission_plan` column so the FE never reads a stale value.
-- 2. Add `lead_source` to users so we can record where parents heard about us
--    (column "How did you hear about us?" in the Cherries Google Form).
-- 3. Add `lead_sources` jsonb column on nurseries so admins can manage their
--    own catalog of sources without code changes.

BEGIN;

-- 1. sync the typo column into the canonical column once
UPDATE public.children
   SET school_admission_plan = school_admissions_plan
 WHERE school_admission_plan IS NULL
   AND school_admissions_plan IS NOT NULL;

COMMENT ON COLUMN public.children.school_admissions_plan IS
  'Deprecated: use school_admission_plan. Retained for backwards compatibility with imports until 2026-07-01.';

-- 2. lead source: canonical home is on children (per-enrollment), with a
-- mirror on users for quick parent-level reporting.
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lead_source text;

COMMENT ON COLUMN public.children.lead_source IS
  'How the family heard about the nursery for this enrollment (Instagram, Friend, Google, etc). Canonical column, populated on import from Active_Kids_Data.xlsx.';
COMMENT ON COLUMN public.users.lead_source IS
  'Mirrored from children.lead_source for the parent who initiated the enrollment. Reporting convenience only.';

-- 3. lead sources catalog on nurseries (optional, admin-controlled)
ALTER TABLE public.nurseries
  ADD COLUMN IF NOT EXISTS lead_sources jsonb NOT NULL DEFAULT
    '["Instagram","Facebook","Google","Friend","Sibling","Walk-in","Other"]'::jsonb;

COMMENT ON COLUMN public.nurseries.lead_sources IS
  'List of strings shown to admins/parents when picking a referral source.';

COMMIT;
