-- Phase 11 Features 2-4: Surveys + Inventory + Meal Plans (simplified)

-- Surveys (extend existing table to support active status + simple title)
ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.surveys
  DROP CONSTRAINT IF EXISTS surveys_status_ck;

ALTER TABLE public.surveys
  ADD CONSTRAINT surveys_status_ck CHECK (status IN ('draft', 'active', 'published', 'closed'));

-- Survey responses (ensure parent flow remains unique per survey/user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_survey_user_uniq
  ON public.survey_responses (survey_id, user_id);

-- Inventory (extend existing table with low stock threshold)
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric;

CREATE INDEX IF NOT EXISTS idx_inventory_low_stock_threshold
  ON public.inventory (low_stock_threshold);

-- Meal plans (new simple weekly menu table)
CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  meals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT meal_plans_nursery_week_uniq UNIQUE (nursery_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_nursery_week
  ON public.meal_plans (nursery_id, week_start_date);

CREATE TRIGGER trg_meal_plans_updated_at
BEFORE UPDATE ON public.meal_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meal_plans_admin_all ON public.meal_plans;
CREATE POLICY meal_plans_admin_all
  ON public.meal_plans FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS meal_plans_parent_select ON public.meal_plans;
CREATE POLICY meal_plans_parent_select
  ON public.meal_plans FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND nursery_id = public.current_user_nursery_id()
  );
