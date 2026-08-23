-- Phase 10 - Daily Reports + Milestones
-- Feature 1: Teacher Daily Report Card System

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS nursery_id uuid REFERENCES public.nurseries (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS meals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nap_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mood_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS toilet_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS activities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS feeding_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS special_notes text;

UPDATE public.daily_reports dr
SET nursery_id = c.nursery_id
FROM public.children c
WHERE dr.child_id = c.id
  AND dr.nursery_id IS NULL;

ALTER TABLE public.daily_reports
  ALTER COLUMN nursery_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_reports_status_ck'
  ) THEN
    ALTER TABLE public.daily_reports
      ADD CONSTRAINT daily_reports_status_ck
      CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_reports_nursery_id ON public.daily_reports (nursery_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_report_date ON public.daily_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON public.daily_reports (status);

DROP POLICY IF EXISTS reports_parent_select ON public.daily_reports;
CREATE POLICY reports_parent_select
  ON public.daily_reports FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND status = 'published'
    AND public.parent_can_access_child(daily_reports.child_id)
  );
