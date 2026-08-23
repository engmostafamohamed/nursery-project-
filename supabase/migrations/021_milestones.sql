-- Phase 10 Feature 3: Milestones tracking

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS nursery_id uuid REFERENCES public.nurseries (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS milestone_text text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS shared_with_parent boolean NOT NULL DEFAULT true;

UPDATE public.milestones m
SET nursery_id = c.nursery_id
FROM public.children c
WHERE m.child_id = c.id
  AND m.nursery_id IS NULL;

ALTER TABLE public.milestones
  ALTER COLUMN nursery_id SET NOT NULL;

-- Keep backward compatibility if old columns exist.
UPDATE public.milestones
SET milestone_text = COALESCE(milestone_text, milestone_name_ar, milestone_name_en)
WHERE milestone_text IS NULL;

ALTER TABLE public.milestones
  ALTER COLUMN milestone_text SET NOT NULL;

-- The original milestones_category_ck (002_batch2) used an older category
-- vocabulary (gross_motor/fine_motor/...). It is superseded by _v2 below; if left
-- in place a row must satisfy BOTH constraints and only 'language'/'social' fit,
-- which blocks the app's real categories (motor_skills, cognitive, ...).
ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS milestones_category_ck;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'milestones_category_ck_v2'
  ) THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_category_ck_v2
      CHECK (category IN ('motor_skills', 'social', 'cognitive', 'language', 'self_care', 'creative'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_milestones_nursery_id ON public.milestones (nursery_id);
CREATE INDEX IF NOT EXISTS idx_milestones_child_id ON public.milestones (child_id);
CREATE INDEX IF NOT EXISTS idx_milestones_teacher_id ON public.milestones (teacher_id);
CREATE INDEX IF NOT EXISTS idx_milestones_achieved_at ON public.milestones (achieved_at);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS milestones_teacher_all ON public.milestones;
CREATE POLICY milestones_teacher_all
  ON public.milestones FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = milestones.child_id
        AND cl.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = milestones.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS milestones_admin_select ON public.milestones;
CREATE POLICY milestones_admin_select
  ON public.milestones FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND milestones.nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS milestones_parent_select ON public.milestones;
CREATE POLICY milestones_parent_select
  ON public.milestones FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND milestones.shared_with_parent = true
    AND public.parent_can_access_child(milestones.child_id)
  );
