-- Parent signup auto-fills the fields that are determined by the chosen nursery
-- (expected arrival time, the nursery's own referral-source list) and shows its
-- hours so the parent can confirm the branch. The picker previously exposed only
-- names, so widen it to the display/operational columns those need.
--
-- Deliberately NOT exposed to anon: pricing_model, base_fee, per_child_fee,
-- bank_account_details, subscription_*, contact_emails — none of it is needed to
-- fill the form, and this view is readable before the parent authenticates.
-- city is included because several nurseries share a name and it is what lets a
-- parent tell two branches apart.

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
  ns.standard_start_time
FROM public.nurseries n
LEFT JOIN public.nursery_settings ns ON ns.nursery_id = n.id
WHERE n.deleted_at IS NULL
  AND COALESCE(NULLIF(lower(n.subscription_status), ''), 'active')
    NOT IN ('inactive', 'cancelled', 'canceled', 'suspended', 'deleted')
ORDER BY n.name_en NULLS LAST, n.name_ar NULLS LAST;

REVOKE ALL ON public.signup_nursery_options FROM public;
GRANT SELECT ON public.signup_nursery_options TO anon, authenticated;
