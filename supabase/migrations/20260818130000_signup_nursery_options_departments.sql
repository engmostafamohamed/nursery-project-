-- The signup form's Department dropdown now reads the nursery's own departments
-- (added by 20260818120000), so the public picker view has to expose them.
-- Same exclusions as before: nothing about pricing, fees, or subscription state.

-- CREATE OR REPLACE cannot insert a column into the middle of a view's column
-- list ("cannot change name of view column"), so the view is dropped first.
DROP VIEW IF EXISTS public.signup_nursery_options;

CREATE VIEW public.signup_nursery_options AS
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
  AND COALESCE(NULLIF(lower(n.subscription_status), ''), 'active')
    NOT IN ('inactive', 'cancelled', 'canceled', 'suspended', 'deleted')
ORDER BY n.name_en NULLS LAST, n.name_ar NULLS LAST;

REVOKE ALL ON public.signup_nursery_options FROM public;
GRANT SELECT ON public.signup_nursery_options TO anon, authenticated;
