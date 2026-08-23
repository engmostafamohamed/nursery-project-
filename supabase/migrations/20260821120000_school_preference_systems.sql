-- =============================================================================
-- The signup step "Enrollment Details" becomes "Future School Plan", and its
-- school preference stops being international/national/bilingual and becomes the
-- academic system the family is aiming for.
--
-- The old values stay allowed: 94 children already carry 'international' or
-- 'national', and dropping them from the constraint would make those rows
-- unwritable on any later update.
-- =============================================================================

ALTER TABLE public.children DROP CONSTRAINT IF EXISTS children_school_preference_check;

ALTER TABLE public.children ADD CONSTRAINT children_school_preference_check
  CHECK (
    school_preference IS NULL
    OR school_preference IN (
      -- academic systems offered by the reworked step
      'british', 'american', 'national', 'ib', 'french', 'canadian', 'other',
      -- retained so existing rows remain valid
      'international', 'bilingual'
    )
  );

COMMENT ON COLUMN public.children.school_preference IS 'Academic system the family plans for: british | american | national | ib | french | canadian | other (legacy: international, bilingual)';
