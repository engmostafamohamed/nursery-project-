-- Give each nursery direct control over whether the public parent/child
-- registration form accepts new submissions for that nursery.

ALTER TABLE public.nursery_settings
  ADD COLUMN IF NOT EXISTS parent_registration_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.nursery_settings.parent_registration_enabled IS
  'When false, this nursery is hidden from public parent signup and the signup Edge Function rejects new submissions.';

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
  ns.standard_start_time
FROM public.nurseries n
LEFT JOIN public.nursery_settings ns ON ns.nursery_id = n.id
WHERE n.deleted_at IS NULL
  AND COALESCE(ns.parent_registration_enabled, true) IS TRUE
  AND COALESCE(NULLIF(lower(n.subscription_status), ''), 'active')
    NOT IN ('inactive', 'cancelled', 'canceled', 'suspended', 'deleted')
ORDER BY n.name_en NULLS LAST, n.name_ar NULLS LAST;

REVOKE ALL ON public.signup_nursery_options FROM public;
GRANT SELECT ON public.signup_nursery_options TO anon, authenticated;
