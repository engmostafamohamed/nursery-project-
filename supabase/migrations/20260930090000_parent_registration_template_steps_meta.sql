-- Per-step display metadata for parent registration templates: a custom tab name/icon in
-- the admin editor, and an explicit "hidden" flag as a cleaner alternative to deactivating
-- every question in a step. The name/icon are cosmetic to the admin editor only; only the
-- `hidden` flag is read by the live signup form (it already skips a step with no active
-- questions — this just gives admins an explicit switch instead of emptying it out).
ALTER TABLE public.parent_registration_templates
  ADD COLUMN IF NOT EXISTS steps_json jsonb NOT NULL DEFAULT '{}'::jsonb;

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
      OR NEW.steps_json IS DISTINCT FROM OLD.steps_json
      OR NEW.nursery_id IS DISTINCT FROM OLD.nursery_id
      OR NEW.created_from_template_id IS DISTINCT FROM OLD.created_from_template_id THEN
      RAISE EXCEPTION 'parent_registration_template_locked';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
    'questions', t.questions_json,
    'steps', t.steps_json
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
