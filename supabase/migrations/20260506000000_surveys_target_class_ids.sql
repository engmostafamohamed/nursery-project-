ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS target_class_ids uuid[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_target_class_ids
  ON public.surveys USING gin (target_class_ids);
