BEGIN;

ALTER TABLE public.nurseries
  ADD COLUMN IF NOT EXISTS language_pref text NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nurseries_language_pref_ck'
  ) THEN
    ALTER TABLE public.nurseries
      ADD CONSTRAINT nurseries_language_pref_ck
      CHECK (language_pref IN ('ar', 'en', 'both'));
  END IF;
END $$;

COMMIT;
