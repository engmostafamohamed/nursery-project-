-- Parent signup is public, so the first screen needs a narrow nursery picker
-- before the parent has an authenticated tenant-scoped profile. Expose only the
-- display fields needed by the dropdown instead of opening the nurseries table.

CREATE OR REPLACE VIEW public.signup_nursery_options AS
SELECT
  id,
  name_en,
  name_ar
FROM public.nurseries
WHERE deleted_at IS NULL
  AND COALESCE(NULLIF(lower(subscription_status), ''), 'active')
    NOT IN ('inactive', 'cancelled', 'canceled', 'suspended', 'deleted')
ORDER BY name_en NULLS LAST, name_ar NULLS LAST;

REVOKE ALL ON public.signup_nursery_options FROM public;
GRANT SELECT ON public.signup_nursery_options TO anon, authenticated;
