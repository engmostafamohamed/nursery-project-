-- Dynamic, versioned Parent Registration templates.
-- Used templates are immutable; admins duplicate them to create a new editable version.

CREATE TABLE IF NOT EXISTS public.parent_registration_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_from_template_id uuid REFERENCES public.parent_registration_templates (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_registration_templates_status_ck CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_parent_registration_templates_active
  ON public.parent_registration_templates (nursery_id)
  WHERE is_active IS TRUE;

CREATE INDEX IF NOT EXISTS idx_parent_registration_templates_nursery
  ON public.parent_registration_templates (nursery_id, created_at DESC);

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS registration_template_id uuid REFERENCES public.parent_registration_templates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registration_template_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS registration_answers_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_applications_registration_template_id
  ON public.applications (registration_template_id);

CREATE OR REPLACE FUNCTION public.parent_registration_template_is_used(p_template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.registration_template_id = p_template_id
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_used_parent_registration_template_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.parent_registration_template_is_used(OLD.id) THEN
      RAISE EXCEPTION 'parent_registration_template_locked';
    END IF;
    RETURN OLD;
  END IF;

  IF public.parent_registration_template_is_used(OLD.id) THEN
    IF NEW.name IS DISTINCT FROM OLD.name
      OR NEW.questions_json IS DISTINCT FROM OLD.questions_json
      OR NEW.nursery_id IS DISTINCT FROM OLD.nursery_id
      OR NEW.created_from_template_id IS DISTINCT FROM OLD.created_from_template_id THEN
      RAISE EXCEPTION 'parent_registration_template_locked';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_used_parent_registration_template_changes ON public.parent_registration_templates;
CREATE TRIGGER trg_prevent_used_parent_registration_template_changes
BEFORE UPDATE OR DELETE ON public.parent_registration_templates
FOR EACH ROW
EXECUTE FUNCTION public.prevent_used_parent_registration_template_changes();

DROP TRIGGER IF EXISTS trg_parent_registration_templates_updated_at ON public.parent_registration_templates;
CREATE TRIGGER trg_parent_registration_templates_updated_at
BEFORE UPDATE ON public.parent_registration_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.parent_registration_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_registration_templates_admin_all ON public.parent_registration_templates;
CREATE POLICY parent_registration_templates_admin_all
  ON public.parent_registration_templates FOR ALL TO authenticated
  USING (
    nursery_id = public.current_user_nursery_id()
    AND public.current_user_role() IN ('branch_admin', 'chain_super_admin')
  )
  WITH CHECK (
    nursery_id = public.current_user_nursery_id()
    AND public.current_user_role() IN ('branch_admin', 'chain_super_admin')
  );

DROP POLICY IF EXISTS parent_registration_templates_public_active ON public.parent_registration_templates;
CREATE POLICY parent_registration_templates_public_active
  ON public.parent_registration_templates FOR SELECT TO anon, authenticated
  USING (is_active IS TRUE AND status = 'active');

CREATE OR REPLACE VIEW public.signup_nursery_options AS
SELECT
  n.id,
  n.name_en,
  n.name_ar,
  n.city,
  n.opens_at,
  n.closes_at,
  n.working_days,
  n.language_pref,
  n.lead_sources,
  n.departments,
  ns.standard_start_time,
  active_template.template_json AS active_registration_template
FROM public.nurseries n
LEFT JOIN public.nursery_settings ns ON ns.nursery_id = n.id
LEFT JOIN LATERAL (
  SELECT jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'version', t.version,
    'questions', t.questions_json
  ) AS template_json
  FROM public.parent_registration_templates t
  WHERE t.nursery_id = n.id
    AND t.is_active IS TRUE
    AND t.status = 'active'
  LIMIT 1
) active_template ON true
WHERE n.deleted_at IS NULL
  AND COALESCE(ns.parent_registration_enabled, true) IS TRUE
  AND COALESCE(NULLIF(lower(n.subscription_status), ''), 'active')
    NOT IN ('inactive', 'cancelled', 'canceled', 'suspended', 'deleted')
ORDER BY n.name_en NULLS LAST, n.name_ar NULLS LAST;

REVOKE ALL ON public.signup_nursery_options FROM public;
GRANT SELECT ON public.signup_nursery_options TO anon, authenticated;
